import { describe, it, expect, vi } from 'vitest';
import { createCaseScopedRetriever } from './case-scoped-retriever.js';
import { hybridSearch } from './hybrid-search.js';

vi.mock('./embedder.js', () => ({
  embed:            vi.fn().mockResolvedValue(null), // skip vector path
  cosineSimilarity: vi.fn().mockReturnValue(0),
}));

// ─── Case-aware mock DB ───────────────────────────────────────────────────────

interface ChunkRow { id: number; document_id: number; chunk_index: number; chunk_text: string }

const CASE1_CHUNKS: ChunkRow[] = [
  { id: 1, document_id: 101, chunk_index: 0, chunk_text: 'rental clause A' },
  { id: 2, document_id: 101, chunk_index: 1, chunk_text: 'rental clause B' },
];
const CASE2_CHUNKS: ChunkRow[] = [
  { id: 3, document_id: 201, chunk_index: 0, chunk_text: 'commercial litigation claim' },
];

function makeCaseAwareDb() {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockImplementation((...args: unknown[]) => {
        // FTS path with case filter
        if (sql.includes('fts_document_chunks') && sql.includes('case_id')) {
          const caseIdArg = args[1] as number;
          return caseIdArg === 1 ? CASE1_CHUNKS : caseIdArg === 2 ? CASE2_CHUNKS : [];
        }
        // vec path: throw so fallback is tested
        if (sql.includes('vec_chunks') || sql.includes('vec_f32')) throw new Error('no such table');
        // No embeddings
        if (sql.includes('ChunkEmbeddings')) return [];
        return [];
      }),
    }),
  };
}

// ─── Retrieval isolation tests ────────────────────────────────────────────────

describe('Case Isolation — createCaseScopedRetriever', () => {
  it('case 1 retriever returns only case 1 document IDs', async () => {
    const db        = makeCaseAwareDb();
    const retriever = createCaseScopedRetriever(1, db);
    const results   = await retriever.search('rental');

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(CASE1_CHUNKS.map((c) => c.document_id)).toContain(r.documentId);
      expect(CASE2_CHUNKS.map((c) => c.document_id)).not.toContain(r.documentId);
    }
  });

  it('case 2 retriever returns only case 2 document IDs', async () => {
    const db        = makeCaseAwareDb();
    const retriever = createCaseScopedRetriever(2, db);
    const results   = await retriever.search('commercial');

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(CASE2_CHUNKS.map((c) => c.document_id)).toContain(r.documentId);
      expect(CASE1_CHUNKS.map((c) => c.document_id)).not.toContain(r.documentId);
    }
  });

  it('scoped retriever never emits cross-case console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    const db      = makeCaseAwareDb();
    await createCaseScopedRetriever(1, db).search('rental');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('direct hybridSearch without caseId emits audit warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    const db      = makeCaseAwareDb();
    await hybridSearch('rental', db); // no caseId
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hybridSearch called without caseId'),
    );
    warnSpy.mockRestore();
  });

  it('respects limit option', async () => {
    const db      = makeCaseAwareDb();
    const results = await createCaseScopedRetriever(1, db).search('clause', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
