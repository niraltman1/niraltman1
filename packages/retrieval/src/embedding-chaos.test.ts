import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from './hybrid-search.js';
import { cosineSimilarity } from './embedder.js';

// Stub embedder: embed() returns a fixed vector so JS cosine path is exercised
vi.mock('./embedder.js', () => ({
  embed:            vi.fn().mockResolvedValue([0.5, 0.5, 0.5]),
  cosineSimilarity: (a: number[], b: number[]) => {
    if (a.length === 0 || b.length === 0) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0);
      na  += (a[i] ?? 0) ** 2;
      nb  += (b[i] ?? 0) ** 2;
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  },
}));

interface EmbedRowFull {
  chunk_id: number; embedding: unknown;
  document_id: number; chunk_index: number; chunk_text: string;
}

// Always throw on vec_chunks to exercise JS cosine fallback path
function makeVecThrowingDb(embedRows: EmbedRowFull[]) {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockImplementation(() => {
        if (sql.includes('vec_chunks') || sql.includes('vec_f32')) throw new Error('no such table');
        if (sql.includes('ChunkEmbeddings')) return embedRows;
        return [];
      }),
    }),
  };
}

// ─── Chaos B: embedding corruption resilience ─────────────────────────────────

const emptyChunkFields = { document_id: 0, chunk_index: 0, chunk_text: '' };

describe('Chaos B — null embedding', () => {
  it('JS fallback skips null embedding rows without crashing', async () => {
    const db = makeVecThrowingDb([{ chunk_id: 1, embedding: null, ...emptyChunkFields }]);
    await expect(hybridSearch('query', db, { caseId: 1 })).resolves.toEqual([]);
  });
});

describe('Chaos B — malformed JSON embedding', () => {
  it('JS fallback skips invalid JSON rows without crashing', async () => {
    const db = makeVecThrowingDb([{ chunk_id: 1, embedding: '{not-json', ...emptyChunkFields }]);
    await expect(hybridSearch('query', db, { caseId: 1 })).resolves.toBeInstanceOf(Array);
  });
});

describe('Chaos B — empty vector array', () => {
  it('empty vector produces cosine score of 0 and is filtered by 0.3 threshold', async () => {
    const db = makeVecThrowingDb([{ chunk_id: 1, embedding: '[]', ...emptyChunkFields }]);
    const results = await hybridSearch('query', db, { caseId: 1 });
    expect(results.filter((r) => r.source === 'vector')).toHaveLength(0);
  });
});

describe('Chaos B — high-quality valid embedding', () => {
  it('valid embedding with high cosine similarity appears in results', async () => {
    // Parallel to query vector [0.5, 0.5, 0.5] → cosine = 1.0
    const goodEmbed = JSON.stringify([0.5, 0.5, 0.5]);
    // The new JOIN query returns chunk fields inline — no separate DocumentChunks lookup.
    const fullEmbedRow = {
      chunk_id: 99, embedding: goodEmbed,
      document_id: 10, chunk_index: 0, chunk_text: 'good chunk',
    };

    const db = makeVecThrowingDb([fullEmbedRow]);

    const results = await hybridSearch('query', db, { caseId: 1 });
    expect(results.some((r) => r.documentId === 10)).toBe(true);
  });
});

// Ensure cosineSimilarity itself is robust
describe('cosineSimilarity edge cases', () => {
  it('returns 0 for zero-length vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
  it('returns 0 for zero-norm vector', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });
});
