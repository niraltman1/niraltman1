import type { DatabaseConnection } from '../connection.js';

/**
 * Citation Intelligence (M4 — directive §4.1.8 extension). Read-only aggregation over
 * citation_registry: per-matter citations grouped by canonical form, with in-case
 * frequency, where they appear (document + snippet), and prior firm use (how many other
 * matters cite the same authority). No AI.
 */

export interface CitationLocation {
  documentId: number | null;
  snippet:    string | null;
}

export interface CitationGroup {
  key:               string;   // canonical_form ?? citation
  citation:          string;   // display form
  citationType:      string | null;
  status:            string;
  resolvedCaseLawId: number | null;
  frequency:         number;          // occurrences within this matter
  firmUsage:         number;          // distinct OTHER matters citing the same authority
  locations:         CitationLocation[];
}

export class CitationsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** Per-matter citation intelligence, most-cited authority first. */
  caseCitationIntelligence(caseId: number): CitationGroup[] {
    const rows = this.db.prepare(`
      SELECT id, citation, canonical_form, citation_type, status,
             resolved_case_law_id, source_document_id, context_snippet
        FROM citation_registry
       WHERE case_id = ?
       ORDER BY created_at ASC
    `).all(caseId) as Record<string, unknown>[];

    // Prior firm use: distinct OTHER matters citing each authority key.
    const firmRows = this.db.prepare(`
      SELECT COALESCE(canonical_form, citation) AS k, COUNT(DISTINCT case_id) AS n
        FROM citation_registry
       WHERE case_id IS NOT NULL AND case_id != ?
       GROUP BY k
    `).all(caseId) as Array<{ k: string; n: number }>;
    const firmUsage = new Map(firmRows.map((r) => [r.k, r.n]));

    const groups = new Map<string, CitationGroup>();
    for (const r of rows) {
      const citation = r['citation'] as string;
      const key = (r['canonical_form'] as string | null) ?? citation;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          citation,
          citationType:      (r['citation_type'] as string | null) ?? null,
          status:            (r['status'] as string | null) ?? 'unresolved',
          resolvedCaseLawId: (r['resolved_case_law_id'] as number | null) ?? null,
          frequency:         0,
          firmUsage:         firmUsage.get(key) ?? 0,
          locations:         [],
        };
        groups.set(key, g);
      }
      g.frequency += 1;
      g.locations.push({
        documentId: (r['source_document_id'] as number | null) ?? null,
        snippet:    (r['context_snippet'] as string | null) ?? null,
      });
      // A linked status anywhere in the group promotes the group.
      if (r['status'] === 'linked') {
        g.status = 'linked';
        g.resolvedCaseLawId = (r['resolved_case_law_id'] as number | null) ?? g.resolvedCaseLawId;
      }
    }

    return [...groups.values()].sort((a, b) => b.frequency - a.frequency || b.firmUsage - a.firmUsage);
  }
}
