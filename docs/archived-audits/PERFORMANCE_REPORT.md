# Factum-IL — Performance Report

> Date: 2026-06-07
> Scope: DB query latency at realistic data volume + frontend production bundle size.
> Out of scope (and why): end-to-end Ollama / law-il-E2B inference latency — this requires
> a running local Ollama instance with `BrainboxAI/law-il-E2B:Q4_K_M` pulled, which is not
> available in this audit environment (no GPU/model server, no network access to pull the
> model). This must be measured manually on a representative office machine; see
> "Follow-up: AI latency" below for the measurement plan.

---

## 1. DB query latency benchmark

### Method

A standalone, reproducible benchmark script — `scripts/benchmark-db.ts` (run via
`pnpm exec tsx scripts/benchmark-db.ts`) — was added to the repo. It:

1. Builds a fresh SQLite DB in a temp file and applies all 67 production migrations via
   `MigrationRunner`, so the schema (indexes, FTS5 triggers, CHECK constraints) exactly
   matches what ships to users.
2. Seeds a synthetic dataset sized like a busy boutique-firm install — **2,000 clients,
   4,000 cases, 30,000 documents** — with realistic Hebrew OCR text drawn from a small
   corpus of Israeli-legal-register paragraphs (contract disputes, family/probate,
   traffic offences, settlements, etc.), so the FTS5 index has non-trivial content to
   rank against.
3. Times the query shapes the live API actually issues on hot paths (`routes/cases.ts`,
   `routes/documents.ts`, `routes/search.ts`), running each 50 times after a 3-iteration
   warm-up and reporting avg / p50 / p95 from `process.hrtime.bigint()` samples.

### Results (this environment — Linux container, better-sqlite3, WAL mode)

```
Dataset: 2,000 clients · 4,000 cases · 30,000 documents (Hebrew OCR text)

Case lookup by id (PK point query)             avg=0.039ms  p50=0.031ms  p95=0.086ms  (n=50)
Case list by client_id (indexed FK scan)       avg=0.106ms  p50=0.104ms  p95=0.147ms  (n=50)
Documents by case_id (indexed FK scan)         avg=0.032ms  p50=0.031ms  p95=0.050ms  (n=50)
FTS5 search on Documents.ocr_text (BM25 rank)  avg=4.868ms  p50=5.818ms  p95=6.270ms  (n=50)
```

(Seed time: ~3s for 36,000 rows across the three transactions — irrelevant to runtime,
included only for reproducibility context.)

### Reading the numbers

- **Point/FK-indexed lookups (case-by-id, cases-by-client, documents-by-case) are
  sub-0.15ms at p95.** These are the queries that back the case detail page, the client
  case list, and the document list — at this volume they are effectively free; SQLite's
  B-tree indexes on `client_id`/`case_id` are doing their job, and there is no realistic
  scenario at boutique-firm scale where these become a bottleneck.
- **FTS5 BM25 search is ~5-6ms p50/p95 over 30K documents of Hebrew OCR text.** This is
  the cost of `routes/search.ts`'s hot path (`MATCH ... ORDER BY rank LIMIT 20`). At this
  volume it is comfortably within "feels instant" territory for a UI search box (sub-10ms
  server-side, well under the ~100ms threshold where users perceive latency). It will
  scale roughly log-linearly with corpus size; a firm with 10× this document count
  (300K documents) would still likely sit well under 50ms server-side.
- **Vector KNN (sqlite-vec) was not measured in this environment** — `SQLITE_VEC_PATH`
  is not set here, so `DatabaseConnection` falls back to the JS-cosine path rather than
  loading the native `vec0` extension (this fallback *is* the live behavior on machines
  without the compiled extension, so the benchmark script correctly detects and skips
  the native-path benchmark with a warning rather than measuring something that isn't
  representative). On a machine with `sqlite-vec` loaded, re-running the script will
  automatically include a `vec_chunks KNN (sqlite-vec native)` benchmark.

### Conclusion

At realistic boutique-firm data volumes, **DB query latency is not a performance concern**
for any of the hot paths benchmarked. All indexed point/scan queries return in fractions
of a millisecond; full-text search over 30K Hebrew documents returns in single-digit
milliseconds. No optimization work is indicated here.

---

## 2. Frontend production bundle size

### Method

Ran the dashboard's production build (`pnpm --filter @factum-il/dashboard build`, i.e.
`tsc && vite build`) and inspected `apps/dashboard/dist/`.

### Results

```
dist/index.html                    0.66 kB  (gzip:   0.42 kB)
dist/assets/index-*.css           93.81 kB  (gzip:  15.63 kB)
dist/assets/index-*.js         1,101.49 kB  (gzip: 270.78 kB)
dist/assets/*.woff2 (19 files)   ~484 kB total (Hebrew/Latin font subsets)

Total dist/ size: ~4.7 MB
```

Vite's build reporter flags the JS bundle as exceeding its 1,000 kB chunk-size warning
threshold:

> (!) Some chunks are larger than 1000 kB after minification. Consider:
> - Using dynamic `import()` to code-split the application
> - Adjust `chunk size limit` for this warning via `build.chunkSizeWarningLimit`

### Reading the numbers

- **270 kB gzipped JS is a large-but-not-alarming single-bundle size** for a feature-rich
  React 19 + TanStack Query + react-router + Zustand SPA covering case management,
  documents, search, communications, agents, admin, and more — this is a desktop-class
  internal tool served from the local API (not a public marketing site sensitive to
  first-load metrics over slow mobile networks), so the usual "ship < 200 kB gzip"
  guidance for public web apps does not directly apply.
- That said, **the single 1.1 MB chunk is a genuine code-splitting opportunity**: the app
  is route-based (`react-router-dom`), and most users will only ever touch a handful of
  routes in a session (e.g., an assistant mostly uses Documents + Search; an attorney
  mostly uses Cases + Agents). Splitting heavy, rarely-used surfaces — Admin, Agents,
  Legal Corpus / Precedents, Communications — into route-level `lazy()` chunks via
  `React.lazy()` + `<Suspense>` would shrink the initial chunk significantly without any
  behavioral change, and is a low-risk, mechanical refactor (no logic changes, just import
  boundaries).
- **Fonts (~484 kB across 19 woff2 subsets) are the single largest asset category** after
  the JS bundle. This is expected for a Hebrew/Latin bilingual RTL app that needs full
  glyph coverage — no action indicated; these are cached aggressively by the browser after
  first load and don't affect repeat-visit performance.

### Conclusion

Bundle size is **acceptable for an internal desktop-hosted tool** but route-level code
splitting of the Admin/Agents/Corpus/Communications surfaces is a worthwhile, low-risk
follow-up that would improve first-paint time on the most common routes (Cases,
Documents, Search) without any functional changes. Recorded as a new tracked item in
`reports/דוח-חוב-טכני.md`.

---

## 3. Follow-up: AI (Ollama / law-il-E2B) latency — requires manual measurement

This report intentionally does **not** include end-to-end AI latency numbers (time to
first token, full 5-step reasoning chain duration, etc.) because:

- `BrainboxAI/law-il-E2B:Q4_K_M` is the **only** model this project may use (per
  `CLAUDE.md`), and it must run locally via Ollama (`http://localhost:11434`) — no
  external API calls are permitted, so there is no cloud fallback to benchmark against.
- This audit environment has no GPU, no Ollama daemon, and no network path to pull a
  ~quantized multi-GB model — running it here would not produce numbers representative
  of a real attorney's workstation anyway.

**Recommended manual measurement plan** (for a future session with access to a real
Ollama install): use the existing `RagHealingService.probeOllama()` pattern and the
agent routes (`/api/agents/summarize`, `/research`, `/contract-review`, etc.) as the
harness — wrap each agent invocation with `process.hrtime.bigint()` (same helper already
in `scripts/benchmark-db.ts`), run each agent type 10× against representative case data,
and report avg/p50/p95 time-to-completion plus first-token latency if streaming. Record
results against the hardware spec used (CPU/GPU/RAM), since law-il-E2B performance is
highly hardware-dependent.
