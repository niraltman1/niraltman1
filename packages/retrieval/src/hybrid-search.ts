import { embed, cosineSimilarity } from './embedder.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export interface SearchResult {
  documentId: number;
  chunkIndex: number;
  chunkText:  string;
  score:      number;
  source:     'fts' | 'vector' | 'hybrid';
}

interface ChunkRow {
  id: number; document_id: number; chunk_index: number; chunk_text: string;
}

interface EmbeddingRow {
  chunk_id: number; embedding: string;
}

// Row shape returned by the native sqlite-vec KNN query
interface VecKnnRow {
  rowid: number; distance: number;
  document_id: number; chunk_index: number; chunk_text: string;
}

const RRF_K = 60;

export async function hybridSearch(
  query:  string,
  db:     DbHandle,
  opts?:  { limit?: number; caseId?: number },
): Promise<SearchResult[]> {
  // Cross-case retrieval is permitted for global/admin searches, but every
  // case-specific agent call MUST pass caseId via createCaseScopedRetriever().
  if (opts?.caseId === undefined) {
    console.warn(
      '[retrieval] hybridSearch called without caseId — results span ALL cases. ' +
      'Use createCaseScopedRetriever() for case-specific agent calls.',
    );
  }

  const limit = opts?.limit ?? 10;

  // ─── Step 1: FTS5 BM25 search ──────────────────────────────────────────────
  const ftsQuery = query.replace(/['"*]/g, ' ').trim();
  let ftsRows: ChunkRow[] = [];
  try {
    const sql = opts?.caseId !== undefined
      ? `SELECT dc.id, dc.document_id, dc.chunk_index, dc.chunk_text
           FROM fts_document_chunks fts
           JOIN DocumentChunks dc ON dc.id = fts.rowid
           JOIN Documents d ON d.id = dc.document_id
          WHERE fts_document_chunks MATCH ? AND d.case_id = ?
          ORDER BY rank LIMIT ?`
      : `SELECT dc.id, dc.document_id, dc.chunk_index, dc.chunk_text
           FROM fts_document_chunks fts
           JOIN DocumentChunks dc ON dc.id = fts.rowid
          WHERE fts_document_chunks MATCH ?
          ORDER BY rank LIMIT ?`;
    const params = opts?.caseId !== undefined
      ? [ftsQuery, opts.caseId, limit * 3]
      : [ftsQuery, limit * 3];
    ftsRows = db.prepare(sql).all(...params) as ChunkRow[];
  } catch {
    // FTS table may not exist yet
  }

  // ─── Step 2: Vector similarity ─────────────────────────────────────────────
  const queryEmbedding = await embed(query);
  const vectorResults: Array<{ row: ChunkRow; score: number }> = [];

  if (queryEmbedding) {
    // Attempt native sqlite-vec KNN path first (fast, in-engine).
    // Falls back to the JS cosine loop when the vec_chunks virtual table or
    // the sqlite-vec extension is not available.
    let usedNativePath = false;
    try {
      const embeddingJson = JSON.stringify(queryEmbedding);
      // Inner subquery performs KNN; outer JOIN applies case filter and fetches text.
      const knnSql = opts?.caseId !== undefined
        ? `SELECT vc.rowid, vc.distance,
                  dc.document_id, dc.chunk_index, dc.chunk_text
             FROM (
               SELECT rowid, distance FROM vec_chunks
                WHERE embedding MATCH vec_f32(?)
                ORDER BY distance LIMIT ?
             ) vc
             JOIN DocumentChunks dc ON dc.id = vc.rowid
             JOIN Documents d ON d.id = dc.document_id
            WHERE d.case_id = ?`
        : `SELECT vc.rowid, vc.distance,
                  dc.document_id, dc.chunk_index, dc.chunk_text
             FROM (
               SELECT rowid, distance FROM vec_chunks
                WHERE embedding MATCH vec_f32(?)
                ORDER BY distance LIMIT ?
             ) vc
             JOIN DocumentChunks dc ON dc.id = vc.rowid`;

      const params: unknown[] = opts?.caseId !== undefined
        ? [embeddingJson, limit * 5, opts.caseId]
        : [embeddingJson, limit * 5];

      const rows = db.prepare(knnSql).all(...params) as VecKnnRow[];
      for (const r of rows) {
        // vec_distance_cosine returns cosine distance (1 - similarity)
        const score = 1.0 - r.distance;
        if (score > 0.3) {
          vectorResults.push({
            row: {
              id: r.rowid,
              document_id: r.document_id,
              chunk_index: r.chunk_index,
              chunk_text: r.chunk_text,
            },
            score,
          });
        }
      }
      vectorResults.sort((a, b) => b.score - a.score);
      usedNativePath = true;
    } catch {
      // sqlite-vec extension or vec_chunks table not available — use JS fallback
    }

    if (!usedNativePath) {
      // JS cosine fallback: load all embeddings for the case and score in-process
      const embedRows = db.prepare(
        `SELECT ce.chunk_id, ce.embedding FROM ChunkEmbeddings ce
         JOIN DocumentChunks dc ON dc.id = ce.chunk_id
         ${opts?.caseId !== undefined ? 'JOIN Documents d ON d.id = dc.document_id WHERE d.case_id = ?' : ''}`,
      ).all(...(opts?.caseId !== undefined ? [opts.caseId] : [])) as EmbeddingRow[];

      for (const er of embedRows) {
        const vec = JSON.parse(er.embedding) as number[];
        const score = cosineSimilarity(queryEmbedding, vec);
        if (score > 0.3) {
          const chunkRow = db.prepare(
            `SELECT id, document_id, chunk_index, chunk_text FROM DocumentChunks WHERE id = ?`,
          ).get(er.chunk_id) as ChunkRow | undefined;
          if (chunkRow) vectorResults.push({ row: chunkRow, score });
        }
      }
      vectorResults.sort((a, b) => b.score - a.score);
    }
  }

  // ─── Step 3: RRF fusion ────────────────────────────────────────────────────
  if (ftsRows.length === 0 && vectorResults.length === 0) return [];

  const rrfMap = new Map<string, { row: ChunkRow; rrfScore: number }>();

  ftsRows.forEach((row, rank) => {
    const key = `${row.document_id}:${row.chunk_index}`;
    const existing = rrfMap.get(key);
    const rrfScore = 1 / (RRF_K + rank + 1);
    if (existing) existing.rrfScore += rrfScore;
    else rrfMap.set(key, { row, rrfScore });
  });

  vectorResults.slice(0, limit * 3).forEach(({ row }, rank) => {
    const key = `${row.document_id}:${row.chunk_index}`;
    const existing = rrfMap.get(key);
    const rrfScore = 1 / (RRF_K + rank + 1);
    if (existing) existing.rrfScore += rrfScore;
    else rrfMap.set(key, { row, rrfScore });
  });

  return [...rrfMap.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit)
    .map(({ row, rrfScore }) => ({
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      chunkText:  row.chunk_text,
      score:      rrfScore,
      source:     (ftsRows.some(r => r.document_id === row.document_id && r.chunk_index === row.chunk_index) &&
                   vectorResults.some(r => r.row.document_id === row.document_id && r.row.chunk_index === row.chunk_index))
                    ? 'hybrid'
                    : ftsRows.some(r => r.document_id === row.document_id && r.chunk_index === row.chunk_index)
                      ? 'fts'
                      : 'vector',
    }));
}
