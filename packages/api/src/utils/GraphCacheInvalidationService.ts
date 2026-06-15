/**
 * GraphCacheInvalidationService — single point for all graph cache invalidation.
 *
 * Call sites import this class rather than calling cache.invalidate() directly
 * so that cache-key changes don't require grep-and-fix across the codebase.
 *
 * Wire into: POST /api/entities/backfill, POST /api/updates/apply,
 * and all case/entity mutation routes.
 */

import { graphCache, CacheKeys } from './GraphInsightsCache.js';

export class GraphCacheInvalidationService {
  /** Invalidate the full graph (nodes + edges) cache. */
  async invalidateGraph(): Promise<void> {
    await graphCache.invalidate(CacheKeys.graph);
  }

  /** Invalidate cached related-entities results for a specific case. */
  async invalidateCase(caseId: number): Promise<void> {
    await graphCache.invalidate(CacheKeys.related(caseId));
  }

  /** Invalidate both the full graph and related-entities for a case. */
  async invalidateRelations(caseId: number): Promise<void> {
    await this.invalidateGraph();
    await this.invalidateCase(caseId);
  }

  /** Invalidate insights cache (global aggregate). */
  async invalidateInsights(): Promise<void> {
    await graphCache.invalidate(CacheKeys.insights);
  }

  /** Full wipe — use after schema migrations or bulk data imports. */
  async invalidateAll(): Promise<void> {
    await graphCache.invalidate();
  }
}

export const graphCacheInvalidation = new GraphCacheInvalidationService();
