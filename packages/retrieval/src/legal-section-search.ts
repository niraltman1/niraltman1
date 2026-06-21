import { embed, cosineSimilarity } from './embedder.js';

interface DbHandle {
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
  };
}

export interface LegalSectionResult {
  sectionId:    number;
  sourceId:     number;
  sourceKey:    string;         // e.g. 'il_law_1234'
  titleHe:      string;
  sectionLabel: string;
  headingHe:    string | null;
  verbatimText: string;
  score:        number;
  source:       'fts' | 'vector' | 'hybrid';
}

interface SectionRow {
  id:               number;
  source_id:        number;
  source_key:       string;
  title_he:         string;
  section_label:    string;
  heading_he:       string | null;
  verbatim_text_he: string;
}

interface EmbeddingRow extends SectionRow {
  section_id: number;
  embedding:  string;
}

const RRF_K = 60;

/**
 * Hybrid BM25 + vector search over the legal corpus (LegalSections + LegalSectionEmbeddings).
 * Mirrors hybridSearch() for document chunks but targets the legislation KB.
 *
 * - FTS5 over fts_legal_sections (created by migration 061)
 * - JS cosine over LegalSectionEmbeddings (JSON vectors; no vec_chunks analog for legal)
 * - RRF fusion (K=60)
 *
 * @param query     Hebrew or Hebrew-transliterated search text.
 * @param db        SQLite database handle.
 * @param opts.limit     Max results (default 10).
 * @param opts.sourceKey Restrict to a single law, e.g. 'il_law_1234'.
 */
export async function searchLegalSections(
  query: string,
  db:    DbHandle,
  opts?: { limit?: number; sourceKey?: string },
): Promise<LegalSectionResult[]> {
  const limit    = opts?.limit ?? 10;
  const bySource = opts?.sourceKey !== undefined;

  // ─── Step 1: FTS5 BM25 search ──────────────────────────────────────────────
  const ftsQuery = query.replace(/['"*]/g, ' ').trim();
  let ftsRows: SectionRow[] = [];
  try {
    const sql = bySource
      ? `SELECT ls.id, ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                src.source_key, src.title_he
           FROM fts_legal_sections fts
           JOIN LegalSections ls  ON ls.id  = fts.rowid
           JOIN LegalSources  src ON src.id = ls.source_id
          WHERE fts_legal_sections MATCH ?
            AND src.source_key = ?
          ORDER BY rank LIMIT ?`
      : `SELECT ls.id, ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                src.source_key, src.title_he
           FROM fts_legal_sections fts
           JOIN LegalSections ls  ON ls.id  = fts.rowid
           JOIN LegalSources  src ON src.id = ls.source_id
          WHERE fts_legal_sections MATCH ?
          ORDER BY rank LIMIT ?`;
    const params: unknown[] = bySource
      ? [ftsQuery, opts!.sourceKey, limit * 3]
      : [ftsQuery, limit * 3];
    ftsRows = db.prepare(sql).all(...params) as SectionRow[];
  } catch {
    // FTS table may not exist yet (corpus not loaded)
  }

  // ─── Step 2: Vector similarity ─────────────────────────────────────────────
  // Native sqlite-vec KNN path first (migration 086, vec_legal_sections); falls
  // back to the JS-cosine loop when the extension / table is unavailable. This
  // removes the O(n) full-scan bottleneck on the legislation KB.
  const queryEmbedding = await embed(query);
  const vectorResults: Array<{ row: SectionRow; score: number }> = [];

  let usedNativePath = false;
  if (queryEmbedding) {
    try {
      const embeddingJson = JSON.stringify(queryEmbedding);
      const knnSql = bySource
        ? `SELECT ls.id, ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                  src.source_key, src.title_he, v.distance
             FROM (SELECT rowid, distance FROM vec_legal_sections
                    WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?) v
             JOIN LegalSections ls  ON ls.id  = v.rowid
             JOIN LegalSources  src ON src.id = ls.source_id
            WHERE src.source_key = ?`
        : `SELECT ls.id, ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                  src.source_key, src.title_he, v.distance
             FROM (SELECT rowid, distance FROM vec_legal_sections
                    WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?) v
             JOIN LegalSections ls  ON ls.id  = v.rowid
             JOIN LegalSources  src ON src.id = ls.source_id`;
      const knnParams: unknown[] = bySource
        ? [embeddingJson, limit * 5, opts!.sourceKey]
        : [embeddingJson, limit * 5];
      const rows = db.prepare(knnSql).all(...knnParams) as Array<SectionRow & { distance: number }>;
      for (const r of rows) {
        const score = 1.0 - r.distance; // cosine distance → similarity
        if (score > 0.3) vectorResults.push({ row: r, score });
      }
      vectorResults.sort((a, b) => b.score - a.score);
      // Only treat the native path as conclusive when it actually produced hits.
      // A missing vec_legal_sections table throws (→ JS fallback); an empty one
      // returns no rows, in which case we still try the JS-cosine path.
      usedNativePath = vectorResults.length > 0;
    } catch {
      // vec_legal_sections / sqlite-vec unavailable — fall through to JS cosine.
    }
  }

  if (queryEmbedding && !usedNativePath) {
    try {
      const sql = bySource
        ? `SELECT lse.section_id, lse.embedding,
                  ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                  src.source_key, src.title_he
             FROM LegalSectionEmbeddings lse
             JOIN LegalSections ls  ON ls.id  = lse.section_id
             JOIN LegalSources  src ON src.id = lse.source_id
            WHERE src.source_key = ?`
        : `SELECT lse.section_id, lse.embedding,
                  ls.source_id, ls.section_label, ls.heading_he, ls.verbatim_text_he,
                  src.source_key, src.title_he
             FROM LegalSectionEmbeddings lse
             JOIN LegalSections ls  ON ls.id  = lse.section_id
             JOIN LegalSources  src ON src.id = lse.source_id`;
      const params: unknown[] = bySource ? [opts!.sourceKey] : [];
      const embedRows = db.prepare(sql).all(...params) as EmbeddingRow[];

      for (const er of embedRows) {
        if (!er.embedding) continue;
        let vec: number[];
        try {
          vec = JSON.parse(er.embedding) as number[];
        } catch {
          continue;
        }
        if (!Array.isArray(vec) || vec.length === 0) continue;
        const score = cosineSimilarity(queryEmbedding, vec);
        if (score > 0.3) {
          vectorResults.push({
            row: { ...er, id: er.section_id },
            score,
          });
        }
      }
      vectorResults.sort((a, b) => b.score - a.score);
    } catch {
      // LegalSectionEmbeddings may be empty (corpus loaded without --embed)
    }
  }

  // ─── Step 3: RRF fusion ────────────────────────────────────────────────────
  if (ftsRows.length === 0 && vectorResults.length === 0) return [];

  const rrfMap = new Map<number, { row: SectionRow; rrfScore: number; inFts: boolean; inVec: boolean }>();

  ftsRows.forEach((row, rank) => {
    const s = rrfMap.get(row.id);
    const delta = 1 / (RRF_K + rank + 1);
    if (s) { s.rrfScore += delta; s.inFts = true; }
    else rrfMap.set(row.id, { row, rrfScore: delta, inFts: true, inVec: false });
  });

  vectorResults.slice(0, limit * 3).forEach(({ row }, rank) => {
    const s = rrfMap.get(row.id);
    const delta = 1 / (RRF_K + rank + 1);
    if (s) { s.rrfScore += delta; s.inVec = true; }
    else rrfMap.set(row.id, { row, rrfScore: delta, inFts: false, inVec: true });
  });

  return [...rrfMap.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ row, rrfScore, inFts, inVec }) => ({
      sectionId:    row.id,
      sourceId:     row.source_id,
      sourceKey:    row.source_key,
      titleHe:      row.title_he,
      sectionLabel: row.section_label,
      headingHe:    row.heading_he,
      verbatimText: row.verbatim_text_he,
      score:        rrfScore,
      source:       (inFts && inVec) ? 'hybrid' : inFts ? 'fts' : 'vector',
    }));
}
