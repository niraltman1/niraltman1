import type { DbHandle, ContradictionFinding } from './types.js';

interface InsightRow {
  document_id:  number;
  court_name:   string | null;
  judge_name:   string | null;
  offense_type: string | null;
  next_hearing: string | null;
}

interface EntityEntry {
  documentId: number;
  value:      string;
}

function buildEntityMap(
  rows:    InsightRow[],
  getter:  (r: InsightRow) => string | null,
): Map<string, EntityEntry[]> {
  const map = new Map<string, EntityEntry[]>();
  for (const row of rows) {
    const value = getter(row);
    if (!value) continue;
    const normalised = value.trim().toLowerCase();
    // key = entity kind; we store all unique values per kind
    const existing = map.get(normalised);
    if (existing) {
      // Only add if not already a duplicate from the same doc
      if (!existing.some(e => e.documentId === row.document_id)) {
        existing.push({ documentId: row.document_id, value });
      }
    } else {
      map.set(normalised, [{ documentId: row.document_id, value }]);
    }
  }
  return map;
}

export function detectContradictions(caseId: number, db: DbHandle): ContradictionFinding[] {
  const rows = db.prepare(
    `SELECT di.document_id, di.court_name, di.judge_name, di.offense_type, di.next_hearing
       FROM DocumentInsights di
      WHERE di.document_id IN (
        SELECT id FROM Documents WHERE case_id = ?
      )`,
  ).all(caseId) as InsightRow[];

  if (rows.length < 2) return [];

  const findings: ContradictionFinding[] = [];

  // Compare each field across documents: if two documents disagree on the same
  // entity kind we emit a contradiction (heuristic, confidence = 0.5).
  const fields: Array<{
    label:  string;
    getter: (r: InsightRow) => string | null;
  }> = [
    { label: 'court_name',   getter: r => r.court_name   },
    { label: 'judge_name',   getter: r => r.judge_name   },
    { label: 'offense_type', getter: r => r.offense_type },
    { label: 'next_hearing', getter: r => r.next_hearing },
  ];

  for (const { label, getter } of fields) {
    // Collect one value per document
    const entries: EntityEntry[] = [];
    for (const row of rows) {
      const value = getter(row);
      if (value && value.trim() !== '') {
        entries.push({ documentId: row.document_id, value: value.trim() });
      }
    }

    if (entries.length < 2) continue;

    // Compare all pairs for mismatches
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        // Safe to access because indices are in-bounds
        if (!a || !b) continue;
        if (a.value.toLowerCase() !== b.value.toLowerCase()) {
          findings.push({
            documentIdA: a.documentId,
            documentIdB: b.documentId,
            description: `Conflicting ${label}: "${a.value}" vs "${b.value}"`,
            confidence:  0.5,
          });
        }
      }
    }
  }

  return findings;
}
