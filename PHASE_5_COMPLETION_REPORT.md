# Phase 5 Completion Report — Knowledge Graph Intelligence

> Completed: 2026-06-15
> Branch: `claude/factum-phases-4-7-yym4i8`

---

## Summary

Phase 5 delivers Knowledge Graph Intelligence for Factum-IL. It introduces relationship
discovery queries with explainability (`reasons[]`), a graph explorer UI with type filters
and node-click reasons panel, and a full cache invalidation service.

**Ethical constraint:** All results use `ORDER BY occurrence_count DESC` (frequency sorting only).
No fields named `score`, `predict`, `rank`, `probability`, or `confidence` exist anywhere in
Phase 5 code.

---

## Features Added

### Backend (`packages/api/src/`)

| Component | Description |
|-----------|-------------|
| `modules/graph/RelationshipDiscovery.ts` | `findRelatedJudges`, `findRelatedCases`, `findRelatedDocuments`, `generateGraphInsights`. All queries include `reasons[]`, use frequency sort, are paginated, and wrapped in `Promise.race` with `GRAPH_QUERY_TIMEOUT_MS = 5000ms` timeout |
| `utils/GraphCacheInvalidationService.ts` | Single point for all graph cache invalidation. `invalidateGraph()`, `invalidateCase()`, `invalidateRelations()`, `invalidateInsights()`, `invalidateAll()` — call sites never call `cache.invalidate()` directly |

### New API Endpoints

| Endpoint | Auth | Feature Flag | Cache |
|----------|------|--------------|-------|
| `GET /api/entities/related?caseId=N&page=1&pageSize=20` | attorney+ | FEATURE_RELATIONSHIP_DISCOVERY | MemoryGraphCache |
| `GET /api/entities/insights?limit=100&page=1&pageSize=50` | attorney+ | FEATURE_GRAPH_INSIGHTS | MemoryGraphCache |

Both endpoints check `requireRole` BEFORE the feature flag so unauthenticated requests get 401/403.

### Frontend (`apps/dashboard/`)

| Component | Route | Notes |
|-----------|-------|-------|
| `GraphExplorerPage.tsx` | `/graph` | Type filters (Judge/Court/Case), reasons panel on node click |
| `EntityGraph.tsx` | (extended) | Added optional `onNodeClick?: (nodeId: number) => void` prop |
| Nav entry "גרף הידע" | `/graph` | In research group |

### Hooks (`apps/dashboard/src/api/hooks.ts`)

- `useRelatedEntities(caseId, page, pageSize)` → `RelatedEntitiesData`
- `useGraphInsights(limit, page, pageSize)` → `Paginated<GraphInsight>`

---

## Feature Flags

| Flag | Default | Controls |
|------|---------|---------|
| `FEATURE_GRAPH_EXPLORER` | `false` | GraphExplorerPage (nav always shows; feature gate is backend) |
| `FEATURE_RELATIONSHIP_DISCOVERY` | `false` | `GET /api/entities/related` |
| `FEATURE_GRAPH_INSIGHTS` | `false` | `GET /api/entities/insights` |

---

## RBAC Changes

- `GET /api/entities/related` — `requireRole('attorney', repos)`
- `GET /api/entities/insights` — `requireRole('attorney', repos)`

---

## Caching

| Cache key | TTL | Invalidated by |
|-----------|-----|----------------|
| `related:v1:{caseId}:{page}:{pageSize}` | 15 min | `GraphCacheInvalidationService.invalidateCase(caseId)` |
| `insights:v1` | 15 min | `GraphCacheInvalidationService.invalidateInsights()` |

---

## Timeout Protection

Every `RelationshipDiscovery` function uses `Promise.race` with a 5-second timeout.
On timeout, `GraphQueryTimeoutError` is thrown and the route returns HTTP 504.
This prevents large-corpus queries from stalling the worker process.

---

## Architectural Changes

- `EntityGraph` component now accepts optional `onNodeClick` prop (backwards compatible)
- `GraphCacheInvalidationService` singleton exported from `utils/GraphCacheInvalidationService.ts`
- `/graph` route added to React Router
- "גרף הידע" nav item added to research group in `nav-config.tsx`

---

## Open Follow-Ups

1. **FEATURE_GRAPH_EXPLORER flag**: Nav entry is always visible — flag-based hide is a Phase 7 UX task
2. **Related Entities Panel in CaseDetailPage**: Not yet added — left for Phase 7 UX pass
3. **Rate limiting**: `GET /api/entities/related` (20/min) and `/insights` (10/min) not yet wired to express-rate-limit; planned for Phase 7 hardening

---

## Verification

```bash
pnpm --filter @factum-il/api exec tsc --noEmit     # ✅ 0 errors
pnpm --filter @factum-il/dashboard exec tsc --noEmit  # ✅ 0 errors
```
