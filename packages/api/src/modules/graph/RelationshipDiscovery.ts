/**
 * RelationshipDiscovery — structurally descriptive relationship queries.
 *
 * All results include reasons[] for explainability. Sorted by occurrence_count DESC
 * (frequency, not predictive scoring). No fields named score/predict/rank/probability/confidence.
 *
 * Wraps each query in Promise.race with GRAPH_QUERY_TIMEOUT_MS to prevent stalling the
 * worker process on large corpora.
 */

export const GRAPH_QUERY_TIMEOUT_MS = 5_000;

interface DbHandle {
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
  };
}

export class GraphQueryTimeoutError extends Error {
  constructor(queryName: string) {
    super(`Graph query timed out after ${GRAPH_QUERY_TIMEOUT_MS}ms: ${queryName}`);
    this.name = 'GraphQueryTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, queryName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new GraphQueryTimeoutError(queryName)), GRAPH_QUERY_TIMEOUT_MS),
    ),
  ]);
}

export interface Paginated<T> {
  items:     T[];
  total:     number;
  page:      number;
  pageSize:  number;
  totalPages: number;
}

function paginate<T>(rows: T[], page: number, pageSize: number): Paginated<T> {
  const total      = rows.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const safePage   = Math.max(1, Math.min(page, totalPages));
  const items      = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { items, total, page: safePage, pageSize, totalPages };
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface RelatedJudge {
  judge:           string;
  occurrenceCount: number;
  reasons:         string[];
}

export interface RelatedCase {
  caseId:          number;
  caseNumber:      string | null;
  occurrenceCount: number;
  reasons:         string[];
}

export interface RelatedDocument {
  documentId:      number;
  title:           string | null;
  occurrenceCount: number;
  reasons:         string[];
}

export interface GraphInsight {
  type:            string;
  label:           string;
  occurrenceCount: number;
  reasons:         string[];
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function findRelatedJudges(
  db: DbHandle,
  caseId: number,
  page = 1,
  pageSize = 20,
  limit = 50,
): Promise<Paginated<RelatedJudge>> {
  return withTimeout(
    Promise.resolve().then(() => {
      const rows = db.prepare(`
        SELECT judge_name AS judge, COUNT(*) AS occurrence_count
          FROM court_hearings
         WHERE case_id = ? AND judge_name IS NOT NULL AND judge_name != ''
         GROUP BY judge_name
         ORDER BY occurrence_count DESC
         LIMIT ?
      `).all(caseId, limit) as { judge: string; occurrence_count: number }[];

      const items: RelatedJudge[] = rows.map((r) => ({
        judge:           r.judge,
        occurrenceCount: r.occurrence_count,
        reasons:         [`הופיע ב-${r.occurrence_count} דיון/ים בתיק`],
      }));
      return paginate(items, page, pageSize);
    }),
    'findRelatedJudges',
  );
}

export async function findRelatedCases(
  db: DbHandle,
  caseId: number,
  page = 1,
  pageSize = 20,
  limit = 50,
): Promise<Paginated<RelatedCase>> {
  return withTimeout(
    Promise.resolve().then(() => {
      const rows = db.prepare(`
        SELECT ch2.case_id, ch2.case_number, COUNT(*) AS occurrence_count,
               GROUP_CONCAT(DISTINCT ch1.judge_name) AS shared_judges
          FROM court_hearings ch1
          JOIN court_hearings ch2
            ON ch1.judge_name = ch2.judge_name
           AND ch2.case_id != ch1.case_id
         WHERE ch1.case_id = ?
           AND ch1.judge_name IS NOT NULL
           AND ch1.judge_name != ''
         GROUP BY ch2.case_id, ch2.case_number
         ORDER BY occurrence_count DESC
         LIMIT ?
      `).all(caseId, limit) as {
        case_id: number; case_number: string | null;
        occurrence_count: number; shared_judges: string | null;
      }[];

      const items: RelatedCase[] = rows.map((r) => ({
        caseId:          r.case_id,
        caseNumber:      r.case_number,
        occurrenceCount: r.occurrence_count,
        reasons:         [
          `חולק ${r.occurrence_count} שופט/ים עם התיק הנוכחי`,
          ...(r.shared_judges ? [`שופטים משותפים: ${r.shared_judges}`] : []),
        ],
      }));
      return paginate(items, page, pageSize);
    }),
    'findRelatedCases',
  );
}

export async function findRelatedDocuments(
  db: DbHandle,
  caseId: number,
  page = 1,
  pageSize = 20,
  limit = 50,
): Promise<Paginated<RelatedDocument>> {
  return withTimeout(
    Promise.resolve().then(() => {
      const rows = db.prepare(`
        SELECT d.id AS document_id, d.filename AS title, COUNT(*) AS occurrence_count
          FROM Documents d
         WHERE d.case_id = ?
         GROUP BY d.id, d.filename
         ORDER BY occurrence_count DESC
         LIMIT ?
      `).all(caseId, limit) as {
        document_id: number; title: string | null; occurrence_count: number;
      }[];

      const items: RelatedDocument[] = rows.map((r) => ({
        documentId:      r.document_id,
        title:           r.title,
        occurrenceCount: r.occurrence_count,
        reasons:         [`מסמך ישיר בתיק זה`],
      }));
      return paginate(items, page, pageSize);
    }),
    'findRelatedDocuments',
  );
}

export async function generateGraphInsights(
  db: DbHandle,
  opts: { limit: number; page?: number; pageSize?: number },
): Promise<Paginated<GraphInsight>> {
  const { limit, page = 1, pageSize = 50 } = opts;

  return withTimeout(
    Promise.resolve().then(() => {
      const judgeRows = db.prepare(`
        SELECT 'judge' AS type, judge_name AS label, COUNT(*) AS occurrence_count
          FROM court_hearings
         WHERE judge_name IS NOT NULL AND judge_name != ''
         GROUP BY judge_name
         ORDER BY occurrence_count DESC
         LIMIT ?
      `).all(Math.ceil(limit / 2)) as { type: string; label: string; occurrence_count: number }[];

      const courtRows = db.prepare(`
        SELECT 'court' AS type, court_name AS label, COUNT(*) AS occurrence_count
          FROM DocumentInsights
         WHERE court_name IS NOT NULL AND court_name != ''
         GROUP BY court_name
         ORDER BY occurrence_count DESC
         LIMIT ?
      `).all(Math.ceil(limit / 2)) as { type: string; label: string; occurrence_count: number }[];

      const typeLabel: Record<string, string> = { judge: 'שופט/ת', court: 'בית משפט' };
      const all = [...judgeRows, ...courtRows]
        .sort((a, b) => b.occurrence_count - a.occurrence_count)
        .slice(0, limit);

      const items: GraphInsight[] = all.map((r) => ({
        type:            r.type,
        label:           r.label,
        occurrenceCount: r.occurrence_count,
        reasons:         [`${typeLabel[r.type] ?? r.type} הופיע/ה ${r.occurrence_count} פעמים במאגר`],
      }));
      return paginate(items, page, pageSize);
    }),
    'generateGraphInsights',
  );
}
