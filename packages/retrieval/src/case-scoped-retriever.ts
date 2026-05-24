import { hybridSearch } from './hybrid-search.js';
import type { SearchResult } from './hybrid-search.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export interface CaseScopedRetriever {
  /** Searches only within the bound caseId — cross-case leaks are structurally impossible. */
  search(query: string, opts?: { limit?: number }): Promise<SearchResult[]>;
}

/**
 * Factory that binds a caseId to hybridSearch(), making it impossible to
 * accidentally query across case boundaries. All retrieval under a case-specific
 * agent MUST use this factory instead of calling hybridSearch() directly.
 */
export function createCaseScopedRetriever(
  caseId: number,
  db:     DbHandle,
): CaseScopedRetriever {
  return {
    search: (query, opts) => hybridSearch(query, db, { ...opts, caseId }),
  };
}
