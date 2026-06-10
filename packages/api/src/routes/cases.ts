import { Router } from 'express';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { validate } from '../middleware/validate.js';
import { createCaseSchema } from '../validation/cases.js';
import { NotFoundError, ValidationError } from '../errors/api-error.js';
import { analyzeEvidenceGaps, getCaseCompleteness, seedProceduralChecklist } from '@factum-il/litigation-intelligence';
import { assessCaseRisk } from '../utils/risk-summary.js';

// Builds a minimal valid .docx (OOXML ZIP) using pizzip without needing a template file.
async function writeMinimalDocx(outPath: string, cas: Record<string, unknown>): Promise<void> {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip();

  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml"  ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml"' +
    ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');

  zip.folder('_rels')!.file('.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"' +
    ' Target="word/document.xml"/>' +
    '</Relationships>');

  const rows = [
    ['מספר תיק',    String(cas['caseNumber']    ?? '—')],
    ['כותרת',       String(cas['titleHe']       ?? '—')],
    ['סטטוס',       String(cas['status']        ?? '—')],
    ['בית משפט',   String(cas['courtName']      ?? '—')],
    ['שופט/ת',      String(cas['judgeName']      ?? '—')],
    ['סוג הליך',    String(cas['procedureType'] ?? '—')],
    ['תאריך פתיחה', String(cas['openedDate']    ?? '—')],
    ['תאריך התיישנות', String(cas['statuteDeadline'] ?? '—')],
  ] as [string, string][];

  const tableRows = rows.map(([label, value]) =>
    `<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${label}</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p></w:tc></w:tr>`
  ).join('');

  zip.folder('word')!.file('document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"' +
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:pPr><w:jc w:val="right"/></w:pPr>' +
    `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>גיליון עבודה — תיק ${String(cas['caseNumber'] ?? '')}</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:bidiVisual/></w:tblPr><w:tblGrid>${tableRows}</w:tblGrid></w:tbl>` +
    '<w:sectPr><w:bidi/></w:sectPr>' +
    '</w:body></w:document>');

  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(outPath, buf);
}

const linkContactSchema = z.object({
  contactId:  z.number().int().positive(),
  roleInCase: z.string().nullish(),
}).strict();

const listCasesQuerySchema = z.object({
  clientId:        z.coerce.number().int().positive().optional(),
  registry_status: z.string().optional(),
  page:            z.coerce.number().int().min(1).optional(),
  pageSize:        z.coerce.number().int().min(1).max(200).optional(),
}).strict();

export function casesRouter(repos: Repos): Router {
  const router = Router();
  const { cases, contacts, calendar, citations, db } = repos;

  router.get('/', validate(listCasesQuerySchema, 'query'), asyncHandler((req, res) => {
    const query = req.query as z.infer<typeof listCasesQuerySchema>;
    if (query.clientId) {
      const result = cases.findByClientId(query.clientId);
      ok(res, result);
      return;
    }
    if (query.registry_status) {
      const registryStatus = query.registry_status;
      const { page, pageSize } = parsePagination(query);
      const offset = (page - 1) * pageSize;
      const rows = db.prepare(`
        SELECT * FROM Cases WHERE registry_status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).all(registryStatus, pageSize, offset) as Record<string, unknown>[];
      const { total } = db.prepare(
        'SELECT COUNT(*) AS total FROM Cases WHERE registry_status = ?'
      ).get(registryStatus) as { total: number };
      ok(res, { items: rows, total, page, pageSize, hasNextPage: total > page * pageSize });
      return;
    }
    const { page, pageSize } = parsePagination(query);
    const result = cases.list(page, pageSize);
    ok(res, result);
  }));

  router.post('/', validate(createCaseSchema), asyncHandler((req, res) => {
    const body = req.body as Parameters<typeof cases.create>[0];
    const newCase = cases.create(body);

    if (body.procedureType) {
      try {
        seedProceduralChecklist(newCase.id, body.procedureType, db as never);
      } catch {
        // Non-critical: case creation should not fail if checklist seeding fails.
      }
    }

    ok(res, { id: newCase.id }, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const c = cases.findById(id);
    if (!c) throw new NotFoundError('Case');
    ok(res, c);
  }));

  router.get('/:id/contacts', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!cases.findById(id)) throw new NotFoundError('Case');
    ok(res, contacts.getForCase(id));
  }));

  router.post('/:id/contacts', validate(linkContactSchema), asyncHandler((req, res) => {
    const caseId = Number(req.params['id']);
    if (!cases.findById(caseId)) throw new NotFoundError('Case');
    const { contactId, roleInCase } = req.body as z.infer<typeof linkContactSchema>;
    contacts.linkToCase(caseId, contactId, roleInCase);
    ok(res, { linked: true });
  }));

  router.delete('/:id/contacts/:contactId', asyncHandler((req, res) => {
    contacts.unlinkFromCase(Number(req.params['id']), Number(req.params['contactId']));
    ok(res, { unlinked: true });
  }));

  router.get('/:id/insights', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new NotFoundError('Case');
    const insights = db.prepare(`
      SELECT di.*, d.filename
        FROM DocumentInsights di
        JOIN Documents d ON d.id = di.document_id
       WHERE d.case_id = ?
       ORDER BY di.confidence DESC
    `).all(id) as unknown[];
    ok(res, insights);
  }));

  // Citation intelligence for a matter (M4) — frequency, locations, prior firm use.
  router.get('/:id/citations', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!cases.findById(id)) throw new NotFoundError('Case');
    ok(res, citations.caseCitationIntelligence(id));
  }));

  // Deterministic factual timeline for a matter (M3 — Interactive Timeline).
  router.get('/:id/timeline', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!cases.findById(id)) throw new NotFoundError('Case');
    ok(res, calendar.caseTimeline(id));
  }));

  // Per-matter risk assessment (§4.4.3 / Risk Dashboard) — composes existing
  // signals only; no AI. See utils/risk-summary.ts for the pure aggregation.
  router.get('/:id/risk', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!cases.findById(id)) throw new NotFoundError('Case');

    const completeness = getCaseCompleteness(id, db as never);
    const gaps         = analyzeEvidenceGaps(id, db as never);
    const today        = new Date().toISOString().slice(0, 10);
    const deadlineRisks = calendar.deadlinesAtRisk(today, 90)
      .filter((d) => d.caseId === id)
      .map((d) => d.risk);

    const unverifiedInsights = (db.prepare(`
      SELECT COUNT(*) AS n
        FROM DocumentInsights di
        JOIN Documents d ON d.id = di.document_id
       WHERE d.case_id = ? AND di.verification_state = 'unverified'
    `).get(id) as { n: number }).n;

    const unresolvedCitations = (db.prepare(
      "SELECT COUNT(*) AS n FROM citation_registry WHERE case_id = ? AND status = 'unresolved'",
    ).get(id) as { n: number }).n;

    ok(res, assessCaseRisk({
      caseId:                id,
      hasChecklist:          completeness.totalSteps > 0,
      completenessScore:     completeness.score,
      evidenceGapPriorities: gaps.map((g) => g.priority),
      deadlineRisks,
      unverifiedInsights,
      unresolvedCitations,
    }));
  }));

  router.post('/:id/worksheet/export', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const cas = cases.findById(id);
    if (!cas) throw new NotFoundError('Case');

    const outDir = path.join(process.env['FACTUM_IL_ROOT'] ?? process.cwd(), '_evidence');
    await fs.mkdir(outDir, { recursive: true });

    const safeNum = String((cas as unknown as Record<string, unknown>)['caseNumber'] ?? `case-${id}`)
      .replace(/[^\w֐-׿-]/g, '_');
    const filename = `${safeNum}-worksheet.docx`;
    const outPath  = path.join(outDir, filename);

    await writeMinimalDocx(outPath, cas as unknown as Record<string, unknown>);
    ok(res, { path: outPath, filename });
  }));

  return router;
}
