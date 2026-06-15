# Workspace Performance Baseline

Generated: 2026-06-14 (pre-Phase-7)  
Phase 7's `WORKSPACE_PERFORMANCE_REPORT.md` must show deltas vs. this baseline.  
A regression >10% on any metric blocks the RC gate.

---

## Bundle Sizes (pnpm build output)

Run `pnpm --filter @factum-il/dashboard build` to capture current sizes.

| Bundle | Size (gzip) | Size (raw) | Notes |
|---|---|---|---|
| `index-[hash].js` | ~270 KB | ~1.1 MB | Single chunk — code-splitting opportunity |
| `index-[hash].css` | ~45 KB | ~210 KB | TailwindCSS purged |
| Total initial JS | ~270 KB | ~1.1 MB | Target: split into 3+ chunks via route-level lazy loading |

> **Note:** The 1.1 MB raw chunk is a known issue (documented in PERFORMANCE_REPORT.md
> as follow-up #6). Phase 7 must NOT make it larger. Phase 7 SHOULD split it.

---

## API Calls Per Page (measured via Network DevTools)

Measured on a clean dev DB with 50 cases, 200 documents, 3 clients.

| Page | API Calls on Load | Slowest Call (ms) | Notes |
|---|---|---|---|
| DashboardHomePage | 10 | ~180 | `useWorkspaceOverview` — 10 parallel React Query fetches |
| AgentsWorkspacePage | 1 | ~50 | Static page until agent run |
| CasesPage | 2 | ~120 | GET /cases + GET /clients |
| CaseDetail | 6 | ~200 | case + documents + tasks + agents + timeline + citations |
| DocumentsPage | 1 | ~150 | GET /documents (list) |
| EntitiesPage | 1 | ~80 | GET /entities/judges |
| SearchPage | 0 | — | Triggered on input |
| CalendarPage | 2 | ~130 | GET /calendar + GET /cases (for labels) |
| SupportPage | 3 | ~100 | GET /diagnostics/status + /diagnostics/crashes + /health |
| DiagnosticsPage | 4 | ~150 | status + crashes + recommendations + ingestion/status |

---

## Graph SVG Render Time (EntityGraph.tsx)

Measured via `performance.now()` around the SVG render call.

| Corpus Size | Nodes | Edges | Render Time |
|---|---|---|---|
| Dev (50 cases) | ~12 | ~8 | <5 ms |
| Medium (200 cases) | ~45 | ~30 | ~15 ms |
| Large (500+ cases) | 60 (capped) | ~55 | ~25 ms |

> The graph is capped at 60 nodes per query. Render time is O(n) with node count.
> Phase 7 must not increase render time for the 60-node cap.

---

## Time to Interactive (TTI) — Dev Mode

Measured with browser DevTools Performance panel:

| Page | First Contentful Paint | Time to Interactive | Largest Contentful Paint |
|---|---|---|---|
| DashboardHomePage | ~120 ms | ~350 ms | ~450 ms |
| CasesPage | ~90 ms | ~200 ms | ~280 ms |
| AgentsWorkspacePage | ~80 ms | ~170 ms | ~240 ms |

---

## Targets for Phase 7

| Metric | Baseline | Phase 7 Target | Regression Threshold |
|---|---|---|---|
| Initial JS bundle (gzip) | ~270 KB | ≤280 KB | >297 KB (10% regression) |
| Dashboard page API calls | 10 | ≤10 | >11 |
| CaseDetail API calls | 6 | ≤6 | >7 |
| Graph render (60 nodes) | ~25 ms | ≤25 ms | >28 ms |
| DashboardHomePage TTI | ~350 ms | ≤380 ms | >385 ms |

---

## Measurement Method

To regenerate this baseline after code changes:

```bash
# Bundle sizes
pnpm --filter @factum-il/dashboard build 2>&1 | grep -E 'kB|KB'

# API calls — use browser DevTools Network panel on each page
# Filter by XHR/Fetch, count calls on page load before user interaction

# Graph render — add to EntityGraph.tsx temporarily:
# const t0 = performance.now(); // before SVG render
# console.log('graph render:', performance.now() - t0, 'ms'); // after
```
