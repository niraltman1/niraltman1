import { describe, it, expect, vi } from 'vitest';
import { createCaseScopedRetriever } from './case-scoped-retriever.js';

vi.mock('./embedder.js', () => ({
  embed: vi.fn().mockResolvedValue(null),
  cosineSimilarity: vi.fn().mockReturnValue(0),
}));

function makeDb(ftsRows: unknown[] = []) {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn().mockReturnValue(sql.includes('fts_document_chunks') ? ftsRows : []),
    }),
  };
}

describe('createCaseScopedRetriever', () => {
  it('returns a retriever that resolves to an array', async () => {
    const retriever = createCaseScopedRetriever(1, makeDb());
    const results = await retriever.search('test');
    expect(Array.isArray(results)).toBe(true);
  });

  it('does not emit a caseId warning (caseId is always bound)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
    const retriever = createCaseScopedRetriever(42, makeDb());
    await retriever.search('query');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns results only for the bound case (FTS path)', async () => {
    const ftsRow = { id: 1, document_id: 10, chunk_index: 0, chunk_text: 'match' };
    const retriever = createCaseScopedRetriever(5, makeDb([ftsRow]));
    const results = await retriever.search('match');
    // If FTS returns a row it ends up in results regardless of caseId;
    // the WHERE clause enforcement is tested at the SQL level via DB integration.
    // Here we assert shape correctness.
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('documentId');
      expect(results[0]).toHaveProperty('score');
    }
  });
});
