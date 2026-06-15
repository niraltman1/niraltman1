import type { DatabaseConnection } from '../connection.js';

export interface LegalDocumentEmbeddingInput {
  documentId: string;  // FDOC-XXXXXXXX
  embedding:  number[];
  model?:     string;
}

export interface LegalDocumentEmbeddingRow {
  readonly id:         number;
  readonly documentId: string;
  readonly model:      string;
  readonly embedding:  number[];
  readonly dim:        number;
  readonly createdAt:  string;
  readonly updatedAt:  string;
}

interface RawRow {
  id: number; document_id: string; model: string;
  embedding: string; dim: number; created_at: string; updated_at: string;
}

function toRow(r: RawRow): LegalDocumentEmbeddingRow {
  return {
    id:         r.id,
    documentId: r.document_id,
    model:      r.model,
    embedding:  JSON.parse(r.embedding) as number[],
    dim:        r.dim,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  };
}

export class LegalDocumentEmbeddingRepository {
  private readonly vecAvailable: boolean;

  constructor(private readonly db: DatabaseConnection) {
    try {
      this.db.prepare('SELECT 1 FROM vec_legal_documents LIMIT 0').get();
      this.vecAvailable = true;
    } catch {
      this.vecAvailable = false;
    }
  }

  upsert(input: LegalDocumentEmbeddingInput): void {
    const embJson = JSON.stringify(input.embedding);
    const model   = input.model ?? 'nomic-embed-text';
    const dim     = input.embedding.length;

    this.db.prepare(`
      INSERT INTO LegalDocumentEmbeddings (document_id, model, embedding, dim)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        embedding  = excluded.embedding,
        model      = excluded.model,
        dim        = excluded.dim,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(input.documentId, model, embJson, dim);

    if (this.vecAvailable) {
      try {
        const docRow = this.db.prepare(
          'SELECT id FROM LegalDocuments WHERE document_id = ?',
        ).get(input.documentId) as { id: number } | undefined;

        if (docRow) {
          this.db.prepare(
            'INSERT OR REPLACE INTO vec_legal_documents(rowid, embedding) VALUES (?, vec_f32(?))',
          ).run(docRow.id, JSON.stringify(input.embedding));
        }
      } catch {
        // sqlite-vec insert failure is non-fatal
      }
    }
  }

  getByDocumentId(documentId: string): LegalDocumentEmbeddingRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalDocumentEmbeddings WHERE document_id = ?',
    ).get(documentId) as RawRow | undefined;
    return raw ? toRow(raw) : null;
  }

  // KNN search using vec_legal_documents (falls back to cosine in caller if unavailable)
  knnSearch(embedding: number[], limit = 10): Array<{ documentId: string; distance: number }> {
    if (!this.vecAvailable) return [];
    try {
      return this.db.prepare(`
        SELECT ld.document_id, v.distance
        FROM vec_legal_documents v
        JOIN LegalDocuments ld ON ld.id = v.rowid
        WHERE ld.is_active = 1 AND ld.visibility_scope = 'PUBLIC'
          AND v.embedding MATCH ? AND k = ?
        ORDER BY v.distance
      `).all(JSON.stringify(embedding), limit) as Array<{ documentId: string; distance: number }>;
    } catch {
      return [];
    }
  }

  // All embeddings for cosine fallback (used when vec0 unavailable)
  allEmbeddings(limit = 1000): Array<{ documentId: string; embedding: number[] }> {
    return (this.db.prepare(
      'SELECT document_id, embedding FROM LegalDocumentEmbeddings LIMIT ?',
    ).all(limit) as Array<{ document_id: string; embedding: string }>).map(r => ({
      documentId: r.document_id,
      embedding:  JSON.parse(r.embedding) as number[],
    }));
  }

  isVecAvailable(): boolean { return this.vecAvailable; }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) as n FROM LegalDocumentEmbeddings').get() as { n: number }).n;
  }
}
