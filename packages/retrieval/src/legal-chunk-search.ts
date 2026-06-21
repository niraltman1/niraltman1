import { embed, cosineSimilarity } from './embedder.js';

interface DbHandle {
  prepare(sql: string): {
    all(...args: unknown[]): unknown[];
  };
}

export interface LegalChunkResult {
  chunkId:    number;
  documentId: string;       // FDOC-XXXXXXXX
  chunkIndex: number;
  chunkText:  string;
  score:      number;
  source:     'fts' | 'vector' | 'hybrid';
}

interface ChunkRow {
  id:          number;
  document_id: string;
  chunk_index: number;
  chunk_text:  string;
}

const RRF_K = 60;

/**
 * Chunk-level hybrid (BM25 + vector) search over case law
 * (LegalDocumentChunks + vec_legal_chunks). Mirrors searchLegalSections() but
 * targets verdict chunks, closing audit finding A.4 #3 (document-level
 * granularity). A relevant passage deep inside a long ruling is now retrievable
 * on its own rather than being averaged into one coarse per-document vector.
 *
 * - FTS5 over fts_legal_chunks (migration 084)
 * - Native sqlite-vec KNN over vec_legal_chunks (migration 088); JS-cosine over
 *   LegalDocumentChunks.embedding when the extension/table is unavailable
 * - RRF fusion (K=60)
 *
 * @param query           Hebrew search text.
 * @param db              SQLite database handle.
 * @param opts.limit      Max results (default 10).
 * @param opts.documentIds Restrict to a set of LegalDocuments.document_id
 *                         (e.g. verdicts anchored to a normative framework).
 */
export async function searchLegalChunks(
  query: string,
  db:    DbHandle,
  opts?: { limit?: number; documentIds?: readonly string[] },
): Promise<LegalChunkResult[]> {
  const limit       = opts?.limit ?? 10;
  const documentIds = opts?.documentIds && opts.documentIds.length > 0 ? opts.documentIds : undefined;
  const idFilter    = documentIds ? new Set(documentIds) : undefined;

  // ─── Step 1: FTS5 BM25 search ──────────────────────────────────────────────
  const ftsQuery = query.replace(/['"*]/g, ' ').trim();
  let ftsRows: ChunkRow[] = [];
  if (ftsQuery) {
    try {
      const rows = db.prepare(`
        SELECT lc.id, lc.document_id, lc.chunk_index, lc.chunk_text
          FROM fts_legal_chunks fts
          JOIN LegalDocumentChunks lc ON lc.id = fts.rowid
         WHERE fts_legal_chunks MATCH ?
         ORDER BY rank LIMIT ?
      `).all(ftsQuery, limit * 3) as ChunkRow[];
      ftsRows = idFilter ? rows.filter(r => idFilter.has(r.document_id)) : rows;
    } catch {
      // FTS table may not exist yet (corpus not loaded)
    }
  }

  // ─── Step 2: Vector similarity ─────────────────────────────────────────────
  // Native sqlite-vec KNN path first (migration 088, vec_legal_chunks); falls
  // back to the JS-cosine loop when the extension / table is unavailable.
  const queryEmbedding = await embed(query);
  const vectorResults: Array<{ row: ChunkRow; score: number }> = [];

  let usedNativePath = false;
  if (queryEmbedding) {
    try {
      const embeddingJson = JSON.stringify(queryEmbedding);
      const rows = db.prepare(`
        SELECT lc.id, lc.document_id, lc.chunk_index, lc.chunk_text, v.distance
          FROM (SELECT rowid, distance FROM vec_legal_chunks
                 WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?) v
          JOIN LegalDocumentChunks lc ON lc.id = v.rowid
      `).all(embeddingJson, limit * 5) as Array<ChunkRow & { distance: number }>;
      for (const r of rows) {
        if (idFilter && !idFilter.has(r.document_id)) continue;
        const score = 1.0 - r.distance; // cosine distance → similarity
        if (score > 0.3) vectorResults.push({ row: r, score });
      }
      vectorResults.sort((a, b) => b.score - a.score);
      usedNativePath = vectorResults.length > 0;
    } catch {
      // vec_legal_chunks / sqlite-vec unavailable — fall through to JS cosine.
    }
  }

  if (queryEmbedding && !usedNativePath) {
    try {
      const embedRows = db.prepare(`
        SELECT id, document_id, chunk_index, chunk_text, embedding
          FROM LegalDocumentChunks
         WHERE embedding IS NOT NULL
      `).all() as Array<ChunkRow & { embedding: string }>;

      for (const er of embedRows) {
        if (idFilter && !idFilter.has(er.document_id)) continue;
        let vec: number[];
        try {
          vec = JSON.parse(er.embedding) as number[];
        } catch {
          continue;
        }
        if (!Array.isArray(vec) || vec.length === 0) continue;
        const score = cosineSimilarity(queryEmbedding, vec);
        if (score > 0.3) vectorResults.push({ row: er, score });
      }
      vectorResults.sort((a, b) => b.score - a.score);
    } catch {
      // LegalDocumentChunks may be empty (corpus loaded without chunk embeddings)
    }
  }

  // ─── Step 3: RRF fusion ────────────────────────────────────────────────────
  if (ftsRows.length === 0 && vectorResults.length === 0) return [];

  const rrfMap = new Map<number, { row: ChunkRow; rrfScore: number; inFts: boolean; inVec: boolean }>();

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
      chunkId:    row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      chunkText:  row.chunk_text,
      score:      rrfScore,
      source:     (inFts && inVec) ? 'hybrid' : inFts ? 'fts' : 'vector',
    }));
}
