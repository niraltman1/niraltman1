import { chunkDocument } from './chunker.js';
import { embed } from './embedder.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): T;
}

export interface IndexResult {
  chunksIndexed:        number;
  embeddingsGenerated:  number;
}

export async function indexDocument(
  documentId: number,
  ocrText:    string,
  db:         DbHandle,
): Promise<IndexResult> {
  const chunks = chunkDocument(ocrText, documentId);
  if (chunks.length === 0) return { chunksIndexed: 0, embeddingsGenerated: 0 };

  // Persist chunks in a transaction
  db.transaction(() => {
    for (const chunk of chunks) {
      db.prepare(`
        INSERT INTO DocumentChunks (document_id, chunk_index, chunk_text, char_start, char_end)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id, chunk_index) DO NOTHING
      `).run(chunk.documentId, chunk.chunkIndex, chunk.text, chunk.charStart, chunk.charEnd);
    }
  });

  // Embed each chunk (outside transaction — async Ollama calls)
  let embeddingsGenerated = 0;
  for (const chunk of chunks) {
    const chunkRow = db.prepare(
      `SELECT id FROM DocumentChunks WHERE document_id = ? AND chunk_index = ?`,
    ).get(documentId, chunk.chunkIndex) as { id: number } | undefined;
    if (!chunkRow) continue;

    const existing = db.prepare(
      `SELECT id FROM ChunkEmbeddings WHERE chunk_id = ?`,
    ).get(chunkRow.id);
    if (existing) continue;

    const embedding = await embed(chunk.text);
    if (embedding) {
      db.prepare(`
        INSERT OR IGNORE INTO ChunkEmbeddings (chunk_id, embedding)
        VALUES (?, ?)
      `).run(chunkRow.id, JSON.stringify(embedding));
      embeddingsGenerated++;
    }
  }

  return { chunksIndexed: chunks.length, embeddingsGenerated };
}
