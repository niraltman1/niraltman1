import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hybridSearch } from './hybrid-search.js';

// Stub embedder so tests don't hit Ollama
vi.mock('./embedder.js', () => ({
  embed: vi.fn().mockResolvedValue(null),   // null → skip vector path entirely
  cosineSimilarity: vi.fn().mockReturnValue(0),
}));

// Minimal in-memory DbHandle
function makeDb(tables: Record<string, unknown[]> = {}) {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockImplementation((..._args: unknown[]) => {
        // Return data for FTS-like queries
        if (sql.includes('fts_document_chunks')) return tables['fts'] ?? [];
        if (sql.includes('ChunkEmbeddings')) return tables['embeddings'] ?? [];
        if (sql.includes('DocumentChunks WHERE id')) return tables['chunks'] ?? [];
        return [];
      }),
    }),
  };
}

// ─── caseId audit warning ────────────────────────────────────────────────────

describe('hybridSearch — caseId audit warning', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
  });

  it('emits a console.warn when caseId is undefined', async () => {
    const db = makeDb();
    await hybridSearch('query', db);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('hybridSearch called without caseId'),
    );
  });

  it('does NOT warn when caseId is provided', async () => {
    const db = makeDb();
    await hybridSearch('query', db, { caseId: 1 });
    expect(console.warn).not.toHaveBeenCalled();
  });
});

// ─── sqlite-vec native path fallback ─────────────────────────────────────────

describe('hybridSearch — sqlite-vec native path with graceful fallback', () => {
  it('returns empty array when FTS and vector results are both empty (no crash)', async () => {
    const db = makeDb();
    const results = await hybridSearch('test query', db, { caseId: 1 });
    expect(results).toEqual([]);
  });

  it('falls back gracefully when vec_chunks throws (extension unavailable)', async () => {
    // Simulate vec_chunks table not existing: the inner prepare().all() throws
    const db = {
      prepare: (sql: string) => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockImplementation(() => {
          if (sql.includes('vec_chunks') || sql.includes('vec_f32')) {
            throw new Error('no such table: vec_chunks');
          }
          return [];
        }),
      }),
    };
    // Should NOT throw — JS fallback (or empty result) is used instead
    await expect(hybridSearch('test', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

// ─── RRF fusion ──────────────────────────────────────────────────────────────

describe('hybridSearch — RRF fusion', () => {
  it('merges FTS results into SearchResult shape', async () => {
    const ftsRow = { id: 10, document_id: 5, chunk_index: 0, chunk_text: 'hello world' };
    const db = makeDb({ fts: [ftsRow] });
    const results = await hybridSearch('hello', db, { caseId: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.documentId).toBe(5);
    expect(results[0]!.chunkIndex).toBe(0);
    expect(results[0]!.chunkText).toBe('hello world');
    expect(results[0]!.source).toBe('fts');
    expect(typeof results[0]!.score).toBe('number');
  });

  it('respects the limit option', async () => {
    // 5 FTS rows
    const ftsRows = Array.from({ length: 5 }, (_, i) => ({
      id: i, document_id: i, chunk_index: 0, chunk_text: `chunk ${i}`,
    }));
    const db = makeDb({ fts: ftsRows });
    const results = await hybridSearch('query', db, { caseId: 1, limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
