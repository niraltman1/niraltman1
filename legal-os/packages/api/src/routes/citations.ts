import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok, fail } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { extractCitations, repairCitation, scoreCitation } from '@legal-os/citation-engine';

const linkSchema = z.object({
  caseLawId: z.number().int().positive(),
}).strict();

const listQuerySchema = z.object({
  caseId:   z.coerce.number().int().positive().optional(),
  status:   z.enum(['unresolved','linked','archived']).optional(),
  type:     z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

interface DocRow {
  id:       number;
  ocr_text: string | null;
  case_id:  number | null;
}

export function citationsRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/citations
  router.get('/', validate(listQuerySchema, 'query'), asyncHandler(async (req, res) => {
    const q        = req.query as { caseId?: string; status?: string; type?: string; page: string; pageSize: string };
    const page     = Number(q.page);
    const pageSize = Number(q.pageSize);
    const offset   = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (q.caseId) { conditions.push('case_id = ?');         params.push(Number(q.caseId)); }
    if (q.status) { conditions.push('status = ?');           params.push(q.status); }
    if (q.type)   { conditions.push('citation_type = ?');    params.push(q.type); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows  = repos.db.prepare(
      `SELECT * FROM citation_registry ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...params, pageSize, offset);

    const total = (repos.db.prepare(`SELECT COUNT(*) AS n FROM citation_registry ${where}`)
      .get(...params) as { n: number }).n;

    ok(res, { rows, total, page, pageSize });
  }));

  // POST /api/citations/harvest/:documentId
  router.post('/harvest/:documentId', asyncHandler(async (req, res) => {
    const docId = Number(req.params['documentId']);
    const doc   = repos.db.prepare('SELECT id, ocr_text, case_id FROM Documents WHERE id = ?')
      .get(docId) as DocRow | undefined;

    if (!doc) { fail(res, 'NOT_FOUND', 'מסמך לא נמצא', 404); return; }
    if (!doc.ocr_text) { ok(res, { harvested: 0, message: 'אין טקסט OCR במסמך' }); return; }

    const text     = doc.ocr_text;
    const inserted: string[] = [];

    const extracted = extractCitations(text);

    // Atomic harvest: all citations from this document inserted in one transaction
    repos.db.transaction<void>(() => {
      for (const { citation, rawMatch, index } of extracted) {
        const repaired   = repairCitation(rawMatch);
        const confidence = scoreCitation(rawMatch, citation);
        const start      = Math.max(0, index - 50);
        const end        = Math.min(text.length, index + rawMatch.length + 50);
        const snippet    = text.slice(start, end).replace(/\s+/g, ' ').trim();

        try {
          repos.db.prepare(`
            INSERT OR IGNORE INTO citation_registry
              (citation, canonical_form, citation_type, confidence_score, structured_json,
               context_snippet, source_document_id, case_id, status)
            VALUES
              (@repaired, @canonical, @type, @score, @json,
               @snippet, @docId, @caseId, 'unresolved')
          `).run({
            repaired,
            canonical:  repaired,
            type:       citation.type,
            score:      confidence.score,
            json:       JSON.stringify(citation),
            snippet,
            docId,
            caseId:     doc.case_id,
          });
          inserted.push(repaired);
        } catch { /* duplicate — skip */ }
      }
    });

    ok(res, { harvested: inserted.length, citations: inserted });
  }));

  // PATCH /api/citations/:id/link
  router.patch('/:id/link', validate(linkSchema), asyncHandler(async (req, res) => {
    const id        = Number(req.params['id']);
    const { caseLawId } = req.body as { caseLawId: number };

    const existing = repos.db.prepare('SELECT id FROM citation_registry WHERE id = ?')
      .get(id) as { id: number } | undefined;
    if (!existing) { fail(res, 'NOT_FOUND', 'ציטוט לא נמצא', 404); return; }

    const lawExists = repos.db.prepare('SELECT id FROM global_case_law WHERE id = ?')
      .get(caseLawId) as { id: number } | undefined;
    if (!lawExists) { fail(res, 'NOT_FOUND', 'תקדים לא נמצא', 404); return; }

    repos.db.prepare(`
      UPDATE citation_registry
      SET resolved_case_law_id = @caseLawId, status = 'linked'
      WHERE id = @id
    `).run({ id, caseLawId });

    const updated = repos.db.prepare('SELECT * FROM citation_registry WHERE id = ?').get(id);
    ok(res, updated);
  }));

  return router;
}
