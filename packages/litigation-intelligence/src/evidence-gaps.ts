import type { DbHandle, EvidenceGap } from './types.js';

interface CaseRow {
  procedure_type: string | null;
}

interface EvidenceRow {
  original_filename: string;
  mime_type:         string | null;
}

function hasFile(items: EvidenceRow[], keyword: string): boolean {
  return items.some(
    e =>
      e.original_filename.toLowerCase().includes(keyword) ||
      (e.mime_type?.toLowerCase().includes(keyword) ?? false),
  );
}

export function analyzeEvidenceGaps(caseId: number, db: DbHandle): EvidenceGap[] {
  const caseRow = db.prepare(
    `SELECT procedure_type FROM Cases WHERE id = ?`,
  ).get(caseId) as CaseRow | undefined;

  if (!caseRow) return [];

  const procedureType = caseRow.procedure_type ?? '';

  const items = db.prepare(
    `SELECT original_filename, mime_type FROM EvidenceItems WHERE case_id = ?`,
  ).all(caseId) as EvidenceRow[];

  const gaps: EvidenceGap[] = [];

  if (procedureType === 'civil' || procedureType === 'civil_standard') {
    if (!hasFile(items, 'contract') && !hasFile(items, 'חוזה')) {
      gaps.push({
        claimDescription:    'Civil claim requires a contract or agreement',
        missingEvidenceKind: 'contract',
        priority:            'high',
      });
    }

    if (!hasFile(items, 'correspondence') && !hasFile(items, 'תכתובת') && !hasFile(items, 'email') && !hasFile(items, 'מכתב')) {
      gaps.push({
        claimDescription:    'Civil claim typically requires correspondence records',
        missingEvidenceKind: 'correspondence',
        priority:            'medium',
      });
    }

    if (!hasFile(items, 'service') && !hasFile(items, 'מסירה') && !hasFile(items, 'delivery')) {
      gaps.push({
        claimDescription:    'Proof of service is required for civil proceedings',
        missingEvidenceKind: 'proof_of_service',
        priority:            'high',
      });
    }
  } else if (procedureType === 'traffic_criminal' || procedureType === 'traffic_administrative') {
    if (!hasFile(items, 'police') && !hasFile(items, 'דוח') && !hasFile(items, 'report')) {
      gaps.push({
        claimDescription:    'Traffic case requires a police report',
        missingEvidenceKind: 'police_report',
        priority:            'high',
      });
    }
  } else if (procedureType === 'insolvency') {
    if (!hasFile(items, 'financial') && !hasFile(items, 'דוח_כספי') && !hasFile(items, 'balance') && !hasFile(items, 'מאזן')) {
      gaps.push({
        claimDescription:    'Insolvency proceeding requires financial statements',
        missingEvidenceKind: 'financial_statements',
        priority:            'high',
      });
    }
  }

  return gaps;
}
