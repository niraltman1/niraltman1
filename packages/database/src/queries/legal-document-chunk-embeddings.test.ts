import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { LegalDocumentChunkEmbeddingRepository } from './legal-document-chunk-embeddings.js';

// Minimal slice of migration 084 (LegalDocumentChunks). The sqlite-vec virtual
// table (vec_legal_chunks, migration 088) is intentionally absent here, so this
// exercises the JS-fallback path that runs in CI without the extension.
const SCHEMA = `
CREATE TABLE LegalDocumentChunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  char_count  INTEGER NOT NULL DEFAULT 0,
  embedding   TEXT,
  UNIQUE(document_id, chunk_index)
);
`;

describe('LegalDocumentChunkEmbeddingRepository', () => {
  let db: DatabaseConnection;
  let repo: LegalDocumentChunkEmbeddingRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare(
      'INSERT INTO LegalDocumentChunks (id, document_id, chunk_index, chunk_text) VALUES (?,?,?,?)',
    ).run(1, 'FDOC-A', 0, 'קטע ראשון');
    db.prepare(
      'INSERT INTO LegalDocumentChunks (id, document_id, chunk_index, chunk_text) VALUES (?,?,?,?)',
    ).run(2, 'FDOC-A', 1, 'קטע שני');
    repo = new LegalDocumentChunkEmbeddingRepository(db);
  });
  afterEach(() => db.close());

  it('reports vec unavailable when the virtual table is absent', () => {
    expect(repo.isVecAvailable()).toBe(false);
  });

  it('upsert writes the JSON embedding onto the chunk row', () => {
    repo.upsert({ chunkId: 1, embedding: [0.1, 0.2, 0.3] });
    const row = db.prepare('SELECT embedding FROM LegalDocumentChunks WHERE id = ?')
      .get(1) as { embedding: string | null };
    expect(row.embedding).not.toBeNull();
    expect(JSON.parse(row.embedding!)).toEqual([0.1, 0.2, 0.3]);
  });

  it('count reflects only embedded chunks', () => {
    expect(repo.count()).toBe(0);
    repo.upsert({ chunkId: 1, embedding: [1, 0] });
    expect(repo.count()).toBe(1);
    repo.upsert({ chunkId: 2, embedding: [0, 1] });
    expect(repo.count()).toBe(2);
  });

  it('knnSearch returns [] when vec is unavailable (caller falls back)', () => {
    repo.upsert({ chunkId: 1, embedding: [1, 0] });
    expect(repo.knnSearch([1, 0], 5)).toEqual([]);
  });

  it('allEmbeddings returns embedded chunks with parsed vectors', () => {
    repo.upsert({ chunkId: 1, embedding: [0.5, 0.5] });
    const all = repo.allEmbeddings();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      chunkId:    1,
      documentId: 'FDOC-A',
      chunkIndex: 0,
      chunkText:  'קטע ראשון',
    });
    expect(all[0]!.embedding).toEqual([0.5, 0.5]);
  });
});
