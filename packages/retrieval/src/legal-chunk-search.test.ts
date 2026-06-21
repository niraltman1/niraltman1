import { describe, it, expect, vi } from 'vitest';
import { searchLegalChunks } from './legal-chunk-search.js';

// Stub embedder so tests never hit Ollama
vi.mock('./embedder.js', () => ({
  embed:            vi.fn().mockResolvedValue(null),
  cosineSimilarity: vi.fn().mockReturnValue(0),
}));

function chunkRow(overrides: Partial<{
  id: number; document_id: string; chunk_index: number; chunk_text: string;
}> = {}) {
  return {
    id: 1, document_id: 'FDOC-00000001', chunk_index: 0, chunk_text: 'קטע מפסק דין',
    ...overrides,
  };
}

function makeDb(opts: {
  ftsRows?:   unknown[];
  vecRows?:   unknown[];   // rows from vec_legal_chunks native path (include distance)
  embedRows?: unknown[];   // rows for JS-cosine fallback (include embedding)
  throwFts?:  boolean;
  throwVec?:  boolean;
} = {}) {
  return {
    prepare: (sql: string) => ({
      all: vi.fn().mockImplementation((..._args: unknown[]) => {
        if (sql.includes('fts_legal_chunks')) {
          if (opts.throwFts) throw new Error('no such table');
          return opts.ftsRows ?? [];
        }
        if (sql.includes('vec_legal_chunks')) {
          if (opts.throwVec) throw new Error('no such table: vec_legal_chunks');
          return opts.vecRows ?? [];
        }
        if (sql.includes('embedding IS NOT NULL')) return opts.embedRows ?? [];
        return [];
      }),
    }),
  };
}

describe('searchLegalChunks — FTS path', () => {
  it('returns correct LegalChunkResult shape from FTS rows', async () => {
    const db = makeDb({ ftsRows: [chunkRow()] });
    const results = await searchLegalChunks('test', db);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      chunkId:    1,
      documentId: 'FDOC-00000001',
      chunkIndex: 0,
      chunkText:  'קטע מפסק דין',
      source:     'fts',
    });
    expect(typeof results[0]!.score).toBe('number');
  });

  it('filters by documentIds when provided', async () => {
    const rows = [
      chunkRow({ id: 1, document_id: 'FDOC-A' }),
      chunkRow({ id: 2, document_id: 'FDOC-B' }),
    ];
    const db = makeDb({ ftsRows: rows });
    const results = await searchLegalChunks('q', db, { documentIds: ['FDOC-A'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.documentId).toBe('FDOC-A');
  });

  it('returns empty array when FTS table is missing (graceful degradation)', async () => {
    const db = makeDb({ throwFts: true });
    const results = await searchLegalChunks('q', db);
    expect(results).toEqual([]);
  });
});

describe('searchLegalChunks — native vec path', () => {
  it('returns vector results from vec_legal_chunks when embed() yields a vector', async () => {
    const { embed } = await import('./embedder.js');
    vi.mocked(embed).mockResolvedValueOnce([0.1, 0.2, 0.3]);

    const db = makeDb({
      vecRows: [{ ...chunkRow({ id: 5, document_id: 'FDOC-V' }), distance: 0.1 }], // similarity 0.9 > 0.3
    });
    const results = await searchLegalChunks('search', db);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.source).toBe('vector');
    expect(results[0]!.documentId).toBe('FDOC-V');
  });

  it('falls back to JS cosine when the native vec table throws', async () => {
    const { embed, cosineSimilarity } = await import('./embedder.js');
    vi.mocked(embed).mockResolvedValueOnce([0.5, 0.5]);
    vi.mocked(cosineSimilarity).mockReturnValue(0.8); // above 0.3 threshold

    const db = makeDb({
      throwVec:  true,
      embedRows: [{ ...chunkRow({ id: 9, document_id: 'FDOC-J' }), embedding: '[0.5,0.5]' }],
    });
    const results = await searchLegalChunks('search', db);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.documentId).toBe('FDOC-J');
    expect(results[0]!.source).toBe('vector');
  });
});

describe('searchLegalChunks — RRF fusion', () => {
  it('marks a chunk present in both FTS and vector as "hybrid"', async () => {
    const { embed } = await import('./embedder.js');
    vi.mocked(embed).mockResolvedValueOnce([0.5, 0.5]);

    const row = chunkRow({ id: 42, document_id: 'FDOC-H' });
    const db = makeDb({
      ftsRows: [row],
      vecRows: [{ ...row, distance: 0.05 }],
    });
    const results = await searchLegalChunks('query', db);
    const hit = results.find(r => r.chunkId === 42);
    expect(hit).toBeDefined();
    expect(hit!.source).toBe('hybrid');
  });
});
