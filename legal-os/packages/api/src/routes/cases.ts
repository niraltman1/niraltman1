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

export function casesRouter(repos: Repos): Router {
  const router = Router();
  const { cases, contacts, db } = repos;

  router.get('/', asyncHandler((req, res) => {
    const query = req.query as Record<string, unknown>;
    if (query['clientId']) {
      const clientId = Number(query['clientId']);
      const result = cases.findByClientId(clientId);
      ok(res, result);
      return;
    }
    const { page, pageSize } = parsePagination(query);
    const result = cases.list(page, pageSize);
    ok(res, result);
  }));

  router.post('/', validate(createCaseSchema), asyncHandler((req, res) => {
    const newCase = cases.create(req.body as Parameters<typeof cases.create>[0]);
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
    const { contactId, roleInCase } = req.body as { contactId: number; roleInCase?: string | null };
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

  router.post('/:id/worksheet/export', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const cas = cases.findById(id);
    if (!cas) throw new NotFoundError('Case');

    const outDir = path.join(process.env['LEGAL_OS_ROOT'] ?? process.cwd(), '_evidence');
    await fs.mkdir(outDir, { recursive: true });

    const safeNum = String((cas as unknown as Record<string, unknown>)['caseNumber'] ?? `case-${id}`)
      .replace(/[^\w֐-׿\-]/g, '_');
    const filename = `${safeNum}-worksheet.docx`;
    const outPath  = path.join(outDir, filename);

    await writeMinimalDocx(outPath, cas as unknown as Record<string, unknown>);
    ok(res, { path: outPath, filename });
  }));

  return router;
}
