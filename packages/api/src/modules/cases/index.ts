/**
 * modules/cases — Business logic extracted from routes/cases.ts.
 *
 * Pure or near-pure functions over repos.db that encapsulate multi-step
 * aggregation.  Route handlers call these instead of inlining the queries.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DatabaseConnection } from '@factum-il/database';
import { getCaseCompleteness, analyzeEvidenceGaps } from '@factum-il/litigation-intelligence';
import { assessCaseRisk } from '../../utils/risk-summary.js';
import type { RiskAssessment } from '../../utils/risk-summary.js';

// ── Risk aggregation ──────────────────────────────────────────────────────────

/** Inputs collected from the DB before calling assessCaseRisk. */
export interface CaseRiskInputs {
  caseId: number;
  db: DatabaseConnection;
  /** Deadline rows already filtered to this case, provided by CalendarRepository. */
  deadlineRisks: Array<'overdue' | 'critical' | 'soon' | 'upcoming'>;
}

/**
 * Gather all per-case risk signals and return a scored RiskAssessment.
 * Performs three DB queries (completeness, insights, citations) in addition
 * to the deadline data supplied by the caller.
 */
export function gatherCaseRisk(inputs: CaseRiskInputs): RiskAssessment {
  const { caseId, db, deadlineRisks } = inputs;

  const completeness = getCaseCompleteness(caseId, db as never);
  const gaps         = analyzeEvidenceGaps(caseId, db as never);

  const unverifiedInsights = (db.prepare(`
    SELECT COUNT(*) AS n
      FROM DocumentInsights di
      JOIN Documents d ON d.id = di.document_id
     WHERE d.case_id = ? AND di.verification_state = 'unverified'
  `).get(caseId) as { n: number }).n;

  const unresolvedCitations = (db.prepare(
    "SELECT COUNT(*) AS n FROM citation_registry WHERE case_id = ? AND status = 'unresolved'",
  ).get(caseId) as { n: number }).n;

  return assessCaseRisk({
    caseId,
    hasChecklist:          completeness.totalSteps > 0,
    completenessScore:     completeness.score,
    evidenceGapPriorities: gaps.map((g) => g.priority),
    deadlineRisks,
    unverifiedInsights,
    unresolvedCitations,
  });
}

// ── Worksheet export ──────────────────────────────────────────────────────────

/**
 * Builds a minimal valid .docx (OOXML ZIP) from a case record using pizzip.
 * No template file required — the structure is generated inline.
 */
export async function writeWorksheetDocx(
  outPath: string,
  cas: Record<string, unknown>,
): Promise<void> {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip();

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml"  ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml"' +
    ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>',
  );

  zip.folder('_rels')!.file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"' +
    ' Target="word/document.xml"/>' +
    '</Relationships>',
  );

  const rows: [string, string][] = [
    ['מספר תיק',           String(cas['caseNumber']      ?? '—')],
    ['כותרת',              String(cas['titleHe']          ?? '—')],
    ['סטטוס',              String(cas['status']           ?? '—')],
    ['בית משפט',           String(cas['courtName']        ?? '—')],
    ['שופט/ת',             String(cas['judgeName']        ?? '—')],
    ['סוג הליך',           String(cas['procedureType']   ?? '—')],
    ['תאריך פתיחה',       String(cas['openedDate']       ?? '—')],
    ['תאריך התיישנות',    String(cas['statuteDeadline']  ?? '—')],
  ];

  const tableRows = rows.map(([label, value]) =>
    `<w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${label}</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t xml:space="preserve">${value}</w:t></w:r></w:p></w:tc></w:tr>`,
  ).join('');

  zip.folder('word')!.file(
    'document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"' +
    ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:pPr><w:jc w:val="right"/></w:pPr>' +
    `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>גיליון עבודה — תיק ${String(cas['caseNumber'] ?? '')}</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:bidiVisual/></w:tblPr><w:tblGrid>${tableRows}</w:tblGrid></w:tbl>` +
    '<w:sectPr><w:bidi/></w:sectPr>' +
    '</w:body></w:document>',
  );

  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  await fs.writeFile(outPath, buf);
}

/**
 * Resolve the output path and safe filename for a case worksheet export.
 * Creates the target directory if it does not exist.
 */
export async function resolveWorksheetPath(
  caseId: number,
  cas: Record<string, unknown>,
): Promise<{ outPath: string; filename: string }> {
  const outDir = path.join(
    process.env['FACTUM_IL_ROOT'] ?? process.cwd(),
    '_evidence',
  );
  await fs.mkdir(outDir, { recursive: true });

  const safeNum = String(cas['caseNumber'] ?? `case-${caseId}`)
    .replace(/[^\wא-ת-]/g, '_');
  const filename = `${safeNum}-worksheet.docx`;
  return { outPath: path.join(outDir, filename), filename };
}
