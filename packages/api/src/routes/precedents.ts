import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { NotFoundError, ValidationError } from '../errors/api-error.js';

const OLLAMA_BASE  = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

function buildVerifyPrompt(p: Record<string, unknown>): string {
  return `אנא נתח את התקדים המשפטי הבא בשלושה חלקים:

תקדים: ${String(p['citation'] ?? '')} — ${String(p['case_title'] ?? '')}
תמצית: ${String(p['summary_he'] ?? '(אין תמצית)')}

1. אנלוגיה משפטית: כיצד תקדים זה חל על מצבים דומים?
2. סיכוני הבחנה: מה יכול להבחין בין תקדים זה לתיק הנוכחי?
3. טיוטת טיעונים: נסח 2-3 טיעונים בעברית המבוססים על תקדים זה.

ענה בפורמט JSON בלבד: {"legalAnalogy":"...","risks":"...","arguments":"...","confidence":0.0}`;
}

function parseAnalysis(raw: string): {
  legalAnalogy: string;
  risks:        string;
  arguments:    string;
  confidence:   number | null;
} {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { legalAnalogy?: string; risks?: string; arguments?: string; confidence?: number };
      return {
        legalAnalogy: parsed.legalAnalogy ?? raw,
        risks:        parsed.risks        ?? '',
        arguments:    parsed.arguments    ?? '',
        confidence:   typeof parsed.confidence === 'number' ? parsed.confidence : null,
      };
    }
  } catch { /* fallback */ }
  return { legalAnalogy: raw, risks: '', arguments: '', confidence: null };
}

const createSchema = z.object({
  citation:      z.string().min(1),
  case_title:    z.string().optional(),
  court_level:   z.enum(['supreme','district','magistrate','administrative','other']).optional(),
  decision_date: z.string().optional(),
  summary_he:    z.string().optional(),
}).strict();

export function precedentsRouter(repos: Repos): Router {
  const router = Router();

  router.get('/', asyncHandler((_req, res) => {
    const rows = repos.db.prepare('SELECT * FROM legal_precedents ORDER BY created_at DESC').all();
    ok(res, rows);
  }));

  router.post('/', validate(createSchema), asyncHandler((req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const result = repos.db.prepare(`
      INSERT INTO legal_precedents (citation, case_title, court_level, decision_date, summary_he)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      b.citation,
      b.case_title    ?? null,
      b.court_level   ?? null,
      b.decision_date ?? null,
      b.summary_he    ?? null,
    );
    const row = repos.db.prepare('SELECT * FROM legal_precedents WHERE id = ?').get(result.lastInsertRowid);
    ok(res, row, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const row = repos.db.prepare('SELECT * FROM legal_precedents WHERE id = ?').get(id);
    if (!row) throw new NotFoundError('Precedent');
    ok(res, row);
  }));

  router.post('/:id/verify', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');

    const precedent = repos.db
      .prepare('SELECT * FROM legal_precedents WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!precedent) throw new NotFoundError('Precedent');

    const cached = repos.db.prepare(`
      SELECT * FROM precedent_deep_analyses
      WHERE precedent_id = ?
        AND created_at > datetime('now', '-24 hours')
      ORDER BY created_at DESC LIMIT 1
    `).get(id);
    if (cached) return ok(res, cached);

    const prompt = buildVerifyPrompt(precedent);
    const ollamaRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    });
    const ollamaJson = await ollamaRes.json() as { response?: string };
    const raw = ollamaJson.response ?? '';
    const parsed = parseAnalysis(raw);

    const ins = repos.db.prepare(`
      INSERT INTO precedent_deep_analyses
        (precedent_id, legal_analogy, distinguishing_risks, drafted_arguments, model_version, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, parsed.legalAnalogy, parsed.risks, parsed.arguments, OLLAMA_MODEL, parsed.confidence ?? null);

    const result = repos.db
      .prepare('SELECT * FROM precedent_deep_analyses WHERE id = ?')
      .get(ins.lastInsertRowid);
    ok(res, result);
  }));

  return router;
}
