import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from './hybrid-search.js';

// Embedder is stubbed so tests never hit Ollama
vi.mock('./embedder.js', () => ({
  embed:             vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity:  vi.fn().mockReturnValue(0.5),
}));

// ─── Scenario helpers ─────────────────────────────────────────────────────────

function makeThrowingDb(triggerOn: string, error = 'no such table: vec_chunks') {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockImplementation(() => {
        if (sql.includes(triggerOn)) throw new Error(error);
        return [];
      }),
    }),
  };
}

function makeEmptyDb() {
  return {
    prepare: (_sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    }),
  };
}

// ─── Compatibility matrix ─────────────────────────────────────────────────────

describe('sqlite-vec compatibility — Scenario 1: vec_chunks table missing', () => {
  it('falls back to JS cosine path without crashing', async () => {
    const db = makeThrowingDb('vec_chunks');
    await expect(hybridSearch('rental contract', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

describe('sqlite-vec compatibility — Scenario 2: vec_f32 function missing', () => {
  it('falls back gracefully when extension function is absent', async () => {
    const db = makeThrowingDb('vec_f32', 'no such function: vec_f32');
    await expect(hybridSearch('contract clause', db, { caseId: 1 })).resolves.toBeDefined();
  });
});

describe('sqlite-vec compatibility — Scenario 3: vec_chunks exists but empty', () => {
  it('returns FTS results when vec is empty', async () => {
    const ftsRow = { id: 1, document_id: 10, chunk_index: 0, chunk_text: 'test result' };
    const db = {
      prepare: (sql: string) => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockImplementation(() => {
          if (sql.includes('vec_chunks') || sql.includes('vec_f32')) return []; // empty vec
          if (sql.includes('fts_document_chunks')) return [ftsRow];
          return [];
        }),
      }),
    };
    const results = await hybridSearch('test', db, { caseId: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.source).toBe('fts');
  });
});

describe('sqlite-vec compatibility — Scenario 4: embedding column is null', () => {
  it('JS fallback skips null embedding rows without crashing', async () => {
    const db = {
      prepare: (sql: string) => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockImplementation(() => {
          // vec path fails → triggers JS fallback
          if (sql.includes('vec_chunks') || sql.includes('vec_f32')) throw new Error('no such table');
          // JS fallback: ChunkEmbeddings with null embedding
          if (sql.includes('ChunkEmbeddings')) return [{ chunk_id: 1, embedding: null }];
          if (sql.includes('DocumentChunks WHERE id')) return [];
          return [];
        }),
      }),
    };
    await expect(hybridSearch('query', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

describe('sqlite-vec compatibility — Scenario 5: malformed JSON embedding', () => {
  it('JS fallback skips invalid JSON rows without crashing', async () => {
    const db = {
      prepare: (sql: string) => ({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn().mockImplementation(() => {
          if (sql.includes('vec_chunks') || sql.includes('vec_f32')) throw new Error('no such table');
          if (sql.includes('ChunkEmbeddings')) return [{ chunk_id: 1, embedding: '{not-json' }];
          if (sql.includes('DocumentChunks WHERE id')) return [];
          return [];
        }),
      }),
    };
    await expect(hybridSearch('query', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

describe('sqlite-vec compatibility — Scenario 6: in-memory database', () => {
  it('hybridSearch works on empty in-memory DB (no vec_chunks)', async () => {
    const db = makeEmptyDb();
    await expect(hybridSearch('query', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

describe('sqlite-vec compatibility — Scenario 7: cross-case call emits audit warning', () => {
  it('emits console.warn but does not throw when caseId is omitted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    const db = makeEmptyDb();
    await expect(hybridSearch('query', db)).resolves.toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('hybridSearch called without caseId'));
    warnSpy.mockRestore();
  });
});
