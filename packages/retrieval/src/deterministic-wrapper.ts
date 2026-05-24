import { hybridSearch } from './hybrid-search.js';
import type { SearchResult } from './hybrid-search.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

// Simple in-memory cache keyed by query+caseId hash
const cache = new Map<string, SearchResult[]>();

function cacheKey(query: string, caseId: number | undefined): string {
  return `${caseId ?? 'null'}:${query}`;
}

export async function deterministicSearch(
  query: string,
  db: DbHandle,
  opts?: { limit?: number; caseId?: number },
): Promise<SearchResult[]> {
  const key = cacheKey(query, opts?.caseId);
  const cached = cache.get(key);
  if (cached) return cached;

  const raw = await hybridSearch(query, db, opts);

  // Stable secondary sort: score DESC (primary, already ordered), then documentId ASC, chunkIndex ASC
  const sorted = [...raw].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.documentId !== b.documentId) return a.documentId - b.documentId;
    return a.chunkIndex - b.chunkIndex;
  });

  cache.set(key, sorted);
  return sorted;
}
