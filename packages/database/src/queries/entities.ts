import type { DatabaseConnection } from '../connection.js';

/**
 * Entity references (M6 — Entity-Centric Navigation). Read-only: surfaces the
 * judge/court names already captured as free text (court_hearings.judge_name,
 * DocumentInsights.judge_name / court_name) so the API layer can normalize +
 * group them with @factum-il/legal-ontology. No pipeline change; the Entities
 * graph table population remains a separate follow-up.
 */

export interface EntityReference {
  name:       string;                  // raw, un-normalized
  kind:       'hearing' | 'document';
  caseId:     number | null;
  caseNumber: string | null;
  refId:      number;                  // hearing id or document id
  date:       string | null;
  title:      string | null;           // hearing_type / filename
}

export class EntitiesRepository {
  constructor(private readonly db: DatabaseConnection) {}

  judgeReferences(): EntityReference[] {
    const hearings = this.db.prepare(`
      SELECT judge_name AS name, case_id, case_number, id AS ref_id, hearing_date AS date, hearing_type AS title
        FROM court_hearings
       WHERE judge_name IS NOT NULL AND TRIM(judge_name) != ''
    `).all() as Record<string, unknown>[];

    const docs = this.db.prepare(`
      SELECT di.judge_name AS name, d.case_id AS case_id, d.id AS ref_id, d.document_date AS date, d.filename AS title
        FROM DocumentInsights di
        JOIN Documents d ON d.id = di.document_id
       WHERE di.judge_name IS NOT NULL AND TRIM(di.judge_name) != ''
    `).all() as Record<string, unknown>[];

    return [
      ...hearings.map((r) => mapRef(r, 'hearing')),
      ...docs.map((r) => mapRef(r, 'document')),
    ];
  }

  courtReferences(): EntityReference[] {
    const docs = this.db.prepare(`
      SELECT di.court_name AS name, d.case_id AS case_id, d.id AS ref_id, d.document_date AS date, d.filename AS title
        FROM DocumentInsights di
        JOIN Documents d ON d.id = di.document_id
       WHERE di.court_name IS NOT NULL AND TRIM(di.court_name) != ''
    `).all() as Record<string, unknown>[];
    return docs.map((r) => mapRef(r, 'document'));
  }
}

function mapRef(r: Record<string, unknown>, kind: 'hearing' | 'document'): EntityReference {
  return {
    name:       r['name'] as string,
    kind,
    caseId:     (r['case_id'] as number | null) ?? null,
    caseNumber: (r['case_number'] as string | null) ?? null,
    refId:      r['ref_id'] as number,
    date:       (r['date'] as string | null) ?? null,
    title:      (r['title'] as string | null) ?? null,
  };
}
