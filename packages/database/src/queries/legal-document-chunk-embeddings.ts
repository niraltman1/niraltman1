import type { DatabaseConnection } from '../connection.js';

/**
 * Chunk-level embedding store for case law (audit finding A.4 #3).
 *
 * Mirrors LegalDocumentEmbeddingRepository but operates at CHUNK granularity:
 * keyed on LegalDocumentChunks.id rather than on a whole LegalDocuments row. Each
 * upsert writes the JSON fallback vector onto LegalDocumentChunks.embedding AND,
 * when the sqlite-vec extension is loaded, into the vec_legal_chunks KNN table
 * (rowid == LegalDocumentChunks.id, migration 088).
 */

export interface LegalChunkEmbeddingInput {
  /** LegalDocumentChunks.id */
  readonly chunkId:   number;
  readonly embedding: number[];
}

export interface LegalChunkKnnHit {
  readonly chunkId:    number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly chunkText:  string;
  readonly distance:   number;
}

export class LegalDocumentChunkEmbeddingRepository {
  private readonly vecAvailable: boolean;

  constructor(private readonly db: DatabaseConnection) {
    try {
      this.db.prepare('SELECT 1 FROM vec_legal_chunks LIMIT 0').get();
      this.vecAvailable = true;
    } catch {
      this.vecAvailable = false;
    }
  }

  /** Persist (or replace) a chunk's embedding in both the JSON column and vec0. */
  upsert(input: LegalChunkEmbeddingInput): void {
    const embJson = JSON.stringify(input.embedding);

    this.db.prepare(
      'UPDATE LegalDocumentChunks SET embedding = ? WHERE id = ?',
    ).run(embJson, input.chunkId);

    if (this.vecAvailable) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO vec_legal_chunks(rowid, embedding) VALUES (?, vec_f32(?))',
        ).run(input.chunkId, embJson);
      } catch {
        // sqlite-vec insert failure is non-fatal — JSON fallback remains.
      }
    }
  }

  /**
   * Native KNN over vec_legal_chunks. Returns [] when the extension/table is
   * unavailable so callers can fall back to FTS or JS cosine.
   */
  knnSearch(embedding: number[], limit = 10): LegalChunkKnnHit[] {
    if (!this.vecAvailable) return [];
    try {
      return this.db.prepare(`
        SELECT lc.id AS chunkId, lc.document_id AS documentId,
               lc.chunk_index AS chunkIndex, lc.chunk_text AS chunkText, v.distance
        FROM (SELECT rowid, distance FROM vec_legal_chunks
               WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT ?) v
        JOIN LegalDocumentChunks lc ON lc.id = v.rowid
      `).all(JSON.stringify(embedding), limit) as LegalChunkKnnHit[];
    } catch {
      return [];
    }
  }

  /** All chunk embeddings for the JS-cosine fallback (vec0 unavailable). */
  allEmbeddings(limit = 5000): Array<{ chunkId: number; documentId: string; chunkIndex: number; chunkText: string; embedding: number[] }> {
    const rows = this.db.prepare(`
      SELECT id, document_id, chunk_index, chunk_text, embedding
      FROM LegalDocumentChunks
      WHERE embedding IS NOT NULL
      LIMIT ?
    `).all(limit) as Array<{ id: number; document_id: string; chunk_index: number; chunk_text: string; embedding: string }>;
    return rows.map(r => ({
      chunkId:    r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      chunkText:  r.chunk_text,
      embedding:  JSON.parse(r.embedding) as number[],
    }));
  }

  isVecAvailable(): boolean { return this.vecAvailable; }

  /** Count of chunks that already have an embedding. */
  count(): number {
    return (this.db.prepare(
      'SELECT COUNT(*) AS n FROM LegalDocumentChunks WHERE embedding IS NOT NULL',
    ).get() as { n: number }).n;
  }
}
