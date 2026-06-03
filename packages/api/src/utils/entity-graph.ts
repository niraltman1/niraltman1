import {
  normalizeJudge, normalizeCourt, upsertEntity, upsertRelation,
} from '@factum-il/legal-ontology';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export interface EntitySourceFields {
  documentId: number;
  caseId:     number | null;
  caseNumber: string | null;
  courtName:  string | null;
  judgeName:  string | null;
}

export interface EntityGraphResult {
  judgeId:      number | null;
  courtId:      number | null;
  caseEntityId: number | null;
  relations:    number;
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/**
 * Persists Judge / Court / Case entities and their relations from one document's
 * extraction into the Entities + EntityRelations knowledge graph (migration 042).
 *
 * Idempotent — UNIQUE(kind, canonical) on Entities and UNIQUE(from_id,to_id,relation)
 * on EntityRelations make repeated calls a no-op. Pure local data: no AI, no network.
 * Empty / honorific-only names are skipped so we never create blank entities.
 */
export function populateEntityGraph(db: DbHandle, fields: EntitySourceFields): EntityGraphResult {
  const result: EntityGraphResult = { judgeId: null, courtId: null, caseEntityId: null, relations: 0 };
  const { documentId, caseId } = fields;

  const judgeRaw = clean(fields.judgeName);
  const courtRaw = clean(fields.courtName);
  const caseNumber = clean(fields.caseNumber);

  const judgeCanonical = judgeRaw ? normalizeJudge(judgeRaw).trim() : '';
  const courtCanonical = courtRaw ? normalizeCourt(courtRaw).trim() : '';

  if (judgeCanonical) {
    result.judgeId = upsertEntity(
      {
        kind: 'Judge',
        canonical: judgeCanonical,
        aliases: judgeRaw && judgeRaw !== judgeCanonical ? [judgeRaw] : [],
        caseId,
        documentId,
      },
      db,
    ) || null;
  }
  if (courtCanonical) {
    result.courtId = upsertEntity(
      {
        kind: 'Court',
        canonical: courtCanonical,
        aliases: courtRaw && courtRaw !== courtCanonical ? [courtRaw] : [],
        caseId,
        documentId,
      },
      db,
    ) || null;
  }
  if (caseNumber) {
    result.caseEntityId = upsertEntity(
      { kind: 'Case', canonical: caseNumber, aliases: [], caseId, documentId },
      db,
    ) || null;
  }

  // Directed relations — only when both endpoints were resolved.
  const link = (from: number | null, to: number | null, relation: string): void => {
    if (from && to) {
      upsertRelation(from, to, relation, db);
      result.relations += 1;
    }
  };
  link(result.judgeId, result.caseEntityId, 'presides_over');
  link(result.courtId, result.caseEntityId, 'hears');
  link(result.judgeId, result.courtId, 'sits_in');

  return result;
}

export interface BackfillResult {
  documents: number;
}

/**
 * On-demand population from existing DocumentInsights rows (joined to Documents for
 * case_id). Lets the persistent graph catch up on documents enriched before this
 * feature existed, without re-running OCR/AI. Idempotent.
 */
export function backfillEntityGraph(db: DbHandle): BackfillResult {
  const rows = db.prepare(`
    SELECT di.document_id AS documentId,
           d.case_id      AS caseId,
           di.case_number AS caseNumber,
           di.court_name  AS courtName,
           di.judge_name  AS judgeName
      FROM DocumentInsights di
      JOIN Documents d ON d.id = di.document_id
     WHERE (di.judge_name  IS NOT NULL AND di.judge_name  <> '')
        OR (di.court_name  IS NOT NULL AND di.court_name  <> '')
        OR (di.case_number IS NOT NULL AND di.case_number <> '')
  `).all() as EntitySourceFields[];

  for (const r of rows) {
    populateEntityGraph(db, r);
  }
  return { documents: rows.length };
}

export interface EntityGraphStats {
  totalEntities: number;
  byKind:        Record<string, number>;
  relations:     number;
}

/** Global counts for observability of the persisted knowledge graph. */
export function entityGraphStats(db: DbHandle): EntityGraphStats {
  const kindRows = db.prepare(
    'SELECT kind, COUNT(*) AS n FROM Entities GROUP BY kind ORDER BY kind ASC',
  ).all() as { kind: string; n: number }[];
  const relRow = db.prepare('SELECT COUNT(*) AS n FROM EntityRelations').get() as { n: number };

  const byKind: Record<string, number> = {};
  let total = 0;
  for (const r of kindRows) {
    byKind[r.kind] = Number(r.n);
    total += Number(r.n);
  }
  return { totalEntities: total, byKind, relations: Number(relRow?.n ?? 0) };
}
