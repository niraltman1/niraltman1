# Factum-IL — Task Tracker

## Phase 0 — Stability ✅ COMPLETE
- TypeScript typecheck errors fixed across 7 packages
- vitest 1.x → 3.x upgrade
- CSV parser fixed (Hebrew mid-field quote)
- GitHub Actions CI wired (typecheck + test + evals jobs)
- Husky pre-commit hooks wired
- PII redacted from all console.log calls

## Phase 1 — Infrastructure Spine ✅ COMPLETE
- `@factum-il/events` — typed domain event bus, idempotent handlers, dead-letter queue
- `@factum-il/observability` — AsyncLocalStorage trace IDs, metrics SQLite sink, Express middleware
- `@factum-il/model-router` — per-model circuit breakers, routing policies
- migrations/040 — Metrics table
- migrations/041 — EventStore, EventHandlerLog, DeadLetterQueue
- RAG worker migrated from 60s polling → event-driven (OCRCompleted)
- activity-emitter wired to EventBus

## Phase 2 — Intelligence Foundation ✅ COMPLETE
- `@factum-il/legal-ontology` — entity types, court hierarchy, synonym registry (migration 042)
- `@factum-il/memory` — case memory, session store, context assembler (migration 043)
- `@factum-il/retrieval` — clause chunker, embedder, hybrid BM25+vector search (migration 044)

## Phase 3 — AI Safety ✅ COMPLETE
- `@factum-il/evals` — golden datasets, eval runner, precision/recall metrics, CI regression job
- `@factum-il/ai-guardrails` — hallucination detector, citation verifier, confidence gate
- Streaming Ollama client + SSE endpoint in API

## Phase 4 — Agent Layer ✅ COMPLETE
- `@factum-il/agent-core` — tool-runner (parallel), prompt-builder (Hebrew 5-step), ollama-caller (graceful degradation), agent-runner (confidence gate + human-review flag)
- `db-tools.ts` — 4 Tool factories (case, documents, tasks, hearings)
- Case Summarizer — POST /api/agents/summarize
- Timeline Builder — POST /api/agents/timeline
- Research Agent — POST /api/agents/research (with guardrail check)
- migrations/045 — AgentResults table

## Phase 5 — Document Intelligence ✅ COMPLETE
- OCRmyPDF fast lane in pipeline (deskew + rotate-pages → pdftotext, fallback to Ghostscript+Tesseract)
- Docling OCR lane (layout-aware, 3rd fallback before Ghostscript)
- `@factum-il/litigation-intelligence` — completeness checker (seeded from Rules_Engine), risk scorer (weighted 40/30/20/10), evidence gap analyzer, contradiction detector, filing dependency graph
- migrations/046: ProceduralChecklist + RiskAssessments tables
- DocumentVersions + Annotations tables (migrations/047) + repositories in database
- PDF annotation types: highlight, note, redline, bookmark

## Phase 6 — Extensibility ✅ COMPLETE
- `@factum-il/sdk` — plugin manifest validator, ExtensionPointRegistry (fire hooks across plugins), loadPlugin with capability sandboxing; 8/8 tests
- RBAC: admin/attorney/assistant/reviewer/read_only roles + requireRole middleware
- Contract Review Agent — POST /api/agents/contract-review (clauses, risks, missing sections; always flagForReview)
- Discovery Agent — POST /api/agents/discovery (pre-computes evidence gaps + completeness via litigation-intelligence; always flagForReview)
- db-tools: makeDocumentTool, makeDocumentInsightsTool, makeCaseEvidenceTool
- Local SHA-256 e-signature system — migration/048 (DocumentSignatures table), 5 API endpoints, DocumentSigningPanel UI
- Eval regression suite — baselines/v1.json, regression.ts, run-evals.ts, CI job

## Phase 7 — Control Plane ✅ COMPLETE
- `@factum-il/orchestrator` — workflow stage coordinator (STAGE_ORDER enforcement), document-level advisory lock, idempotency deduplication engine
- `@factum-il/policy-engine` — memory write policy (FACT=allow, AI_SUMMARY=threshold-gated, AI_HYPOTHESIS=deny), agent run policy (deny if already running), retrieval policy stub
- migrations/049 — WorkflowStates, WorkflowIdempotencyLog, AgentRunRegistry tables
- `memory-guard.ts` (additive) — guardMemoryWrite filter in @factum-il/memory
- `deterministic-wrapper.ts` (additive) — stable secondary sort + session cache in @factum-il/retrieval
- `execution-guard.ts` (additive) — canRunAgent / markAgentCompleted / markAgentFailed in @factum-il/agent-core
- 5 control-plane observability metrics added to @factum-il/observability

## Agent Workspace UI ✅ COMPLETE
- `/agents` page — 5-agent tab workspace (summarize, timeline, discovery, contract-review, research)
- `AgentOutputPanel` — reusable component (confidence bar, tool accordion, review banner, Ollama badge)
- CaseDetail — collapsible "בינה מלאכותית" section (סכם תיק | בנה ציר זמן | נתח גילוי ראיות)
- DocumentDetail — "סקירת חוזה AI" button + inline AgentOutputPanel
- Sidebar — סוכני AI nav item

## Monorepo Structure (21 packages + 2 apps)

```
apps/dashboard      ← React 19 RTL, 20+ feature modules
apps/installer      ← PowerShell Windows installer

packages/
  agent-core        ← AgentRunner, tool-runner, execution-guard
  ai                ← OllamaClient, circuit breaker, streaming
  ai-guardrails     ← hallucination detector, citation verifier, confidence gate
  api               ← Express, 40+ routes
  citation-engine   ← Israeli citation parser (Nevo 2021)
  database          ← SQLite + FTS5 + 49 migrations, 17+ repositories
  evals             ← golden datasets, eval runner, regression suite
  events            ← typed domain event bus, event store
  legal-ontology    ← entity types, court hierarchy, synonyms
  litigation-intelligence ← completeness checker, risk scorer, evidence gaps
  memory            ← case memory, session store, memory-guard
  model-router      ← per-model circuit breakers, routing policies
  observability     ← pino logger, metrics SQLite sink, trace IDs
  orchestrator      ← workflow stage coordinator, idempotency engine
  pipeline          ← OCR (OCRmyPDF+Docling+Tesseract), file watcher
  policy-engine     ← memory/agent/retrieval policy rules
  retrieval         ← clause chunker, embedder, hybrid BM25+vector, deterministic-wrapper
  sdk               ← plugin manifest, ExtensionPointRegistry, loadPlugin
  shared            ← types, logging, state-machine, metrics
```

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry

Next available: **050**

## Phase 8 — Case-Isolated Intelligence Architecture ✅ COMPLETE (2026-05-24)

### What was completed this session
All 4 additive layers of the architecture audit are implemented and green. Strictly no breaking changes.

**Layer 1 — DB Architecture & Native Vector Performance**
- `packages/database/src/connection.ts` — ATTACH `_data.db` AS data_store on every non-memory connection; skipped for `:memory:` and read-only
- `migrations/052_vec_chunks.sql` — SKIP_ON_ERROR pragma; `vec_chunks` vec0 virtual table + sync trigger for ChunkEmbeddings
- `packages/retrieval/src/hybrid-search.ts` — native sqlite-vec KNN path with JS cosine fallback; audit warn when caseId absent
- `packages/retrieval/package.json` — `sqlite-vec ^0.1.6` dependency

**Layer 2 — CaseExecutionContext + User Isolation**
- `packages/agent-core/src/case-execution-context.ts` — `computeCaseStateHash`, `checkExecutionValidity` (returns `isStale`, never throws)
- `packages/agent-core/src/case-isolation-domain.ts` — RBAC v1 (active user + case existence), `AuthorizationError`, `createCaseDomain` factory

**Layer 3 — Case-Scoped Facades**
- `packages/retrieval/src/case-scoped-retriever.ts` — `createCaseScopedRetriever(caseId, db)`
- `packages/memory/src/case-scoped-memory.ts` — `createCaseScopedMemory`, `CaseScopedSessionStore` (key prefix isolation)

**Layer 4 — API Route Wiring**
- `packages/api/src/middleware/case-execution-guard.ts` — `withCaseExecutionGuard` (INSERT OR IGNORE → 409 AGENT_BUSY)
- `packages/api/src/routes/agents.ts` — all 5 routes use guard + markAgentCompleted/Failed + `{ isStale, staleReason }` response
- `packages/policy-engine/src/agent-policy.ts` — NULL-safe SQL fix: `IS ?` → `(= ? OR (IS NULL AND ? IS NULL))`

### Draft PR
https://github.com/niraltman1/niraltman1/pull/8

### What to do next
- Review & merge PR #8 when ready
- Consider adding per-attorney `CaseAssignments` table for RBAC v2 (hook point is marked in `case-isolation-domain.ts`)
- Consider moving DocumentChunks + ChunkEmbeddings + OCRCache to the `data_store` schema now that ATTACH is live

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)

Next available: **053**

## Phase 9 — Pre-Release Validation & Merge Hardening ✅ COMPLETE (2026-05-25)

### What was completed this session

**Observability Journal (Migration 053)**
- `migrations/053_agent_execution_events.sql` — AgentExecutionEvents table + 4 indexes
- `packages/agent-core/src/execution-journal.ts` — `journalEvent()` (never throws; append-only)
- Wired into all 5 agent routes: `execution_started`, `execution_completed`, `execution_failed`, `stale_detected`
- Wired into concurrency guard middleware: `concurrency_blocked`
- Exported from `packages/agent-core/src/index.ts`

**New Test Files (69 additional tests → 347 total)**
- `packages/agent-core/src/concurrency-stress.test.ts` — 7 tests (lock race prevention, release, cross-case independence)
- `packages/agent-core/src/stale-execution.test.ts` — 8 tests (4 mutation types, DB error optimism, case deletion)
- `packages/agent-core/src/rbac-integration.test.ts` — 8 tests (auth-first order, AuthorizationError class integrity)
- `packages/agent-core/src/agent-chaos.test.ts` — 5 tests (Chaos A: execution failures, lock cleanup, DB integrity)
- `packages/retrieval/src/sqlite-vec-compat.test.ts` — 7 tests (7 fallback scenarios)
- `packages/retrieval/src/embedding-chaos.test.ts` — 7 tests (Chaos B: null/malformed/empty embeddings)
- `packages/retrieval/src/case-isolation-retrieval.test.ts` — 5 tests (scoped retrieval, audit warning)
- `packages/database/src/migration-chaos.test.ts` — 6 tests (Chaos C: SKIP_ON_ERROR, retry, DB integrity)

**Production Bug Fixed**
- `packages/retrieval/src/hybrid-search.ts` — JS cosine fallback now guards against null embeddings,
  malformed JSON, and empty vectors. Found via chaos testing (Chaos B).

**Scripts**
- `scripts/healthcheck.ts` — 6-check JSON healthcheck (sqlite, filesystem, vec_extension, port, ollama)
- `scripts/release-validate.sh` — clean-env build + test validation pipeline

**Reports (9 files in reports/)**
- `reports/static-validation-report.md`
- `reports/case-isolation-report.md`
- `reports/concurrency-report.md`
- `reports/stale-execution-report.md`
- `reports/sqlite-vec-compatibility-report.md`
- `reports/rbac-validation-report.md`
- `reports/chaos-testing-report.md`
- `reports/release-verification-report.md`
- `reports/final-release-readiness-report.md`

**Portable Runtime Bundle**
- `dist/factum-il-portable/` — start.sh, start.bat, config/.env.example, VERSION, README.md (gitignored, generated at build time)

### What to do next
- Merge PR #8 (all validation complete, verdict: READY)
- RBAC v2: add `CaseAssignments` table (hook point in `case-isolation-domain.ts`)
- vec_chunks backfill script: one-time migration for existing ChunkEmbeddings rows
- AgentExecutionEvents API + dashboard view (GET /api/admin/journal)
- ESLint configuration for monorepo

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)
053: AgentExecutionEvents

Next available: **054**

## Commercial Beta Readiness — Complete (2026-05-26)

### Completed this session

**Self-Hosted Dependencies + Local GGUF (PR #9)**
- `.github/workflows/stage-deps.yml` — manual workflow: downloads Node 22.13.1, Ollama 0.9.0, WebView2, law-il-E2B Q4_K_M GGUF (~1.3 GB) from HuggingFace → uploads all 4 to `v-deps-1.0.0` GitHub Release
- `publish.ps1` (root + apps/desktop) — all download URLs now point to `v-deps-1.0.0` GitHub Release (no external deps during CI)
- `installer.iss` — GGUF bundled to `{app}\models\law-il-E2B-Q4_K_M.gguf`
- `OllamaService.cs` — `GetBundledGgufPath()` + `CreateFromLocalAsync()`: prefers local GGUF, falls back to Ollama Hub pull

**New packages:**
- `packages/support-diagnostics` — diagnostics collection, crash reporting, redaction pipeline, support bundle export (NDJSON)
- `packages/update-core` — VersionManifest parser, UpdateChannel abstraction, RollbackMetadata, UpdateStateStore
- `packages/enterprise-hooks` — capability registry (all disabled at beta tier)
- `packages/encrypted-backup` — AES-256-GCM via Node.js built-in crypto; PBKDF2 key derivation

**Desktop shell hardening:**
- `FactumIL.Desktop/StartupValidator.cs` — 7-check boot validation
- `FactumIL.Desktop/DiagnosticsService.cs` — crash capture, startup diagnostics, support bundle trigger
- `FactumIL.Desktop/RecoveryWindow.xaml` + `.cs` — Hebrew RTL recovery UI
- `FactumIL.Desktop/ApiHostService.cs` — `Start(safeMode: bool)` sets `FACTUM_IL_SAFE_MODE=1` env var
- `FactumIL.Desktop/App.xaml.cs` — RecoveryWindow modal; after "continue", API restarted in safe mode
- `FactumIL.Desktop/FactumIL.Desktop.csproj` — `SelfContained=false` (aligned with `--no-self-contained` CLI flag)

**API routes:**
- `packages/api/src/routes/diagnostics.ts` — GET /status, POST /bundle, GET/DELETE /crashes
- `packages/api/src/routes/recovery.ts` — GET /status, GET /events, POST /event, GET /agents, GET /pipeline, POST /clear-locks
- `packages/api/src/routes/updates.ts` — NEW: GET /app-check, GET /channel, POST /channel (uses update-core)
- `packages/api/src/start.ts` — `FACTUM_IL_SAFE_MODE=1` gates all 6 background workers
- `packages/api/src/utils/server-config-writer.ts` — `safeMode: boolean` field added

**Migration:**
- `migrations/054_system_events.sql` — SystemEvents table for startup/crash/recovery event persistence

**Dashboard:**
- `apps/dashboard/src/components/admin/HealthStatusPanel.tsx` — live health widget (30s refresh)
- `apps/dashboard/src/components/admin/SupportExportButton.tsx` — support bundle export
- `apps/dashboard/src/components/admin/UpdateNotificationBanner.tsx` — NEW: auto-update notification with mandatory/optional distinction, gold Hebrew banner, download link
- Updated `DiagnosticsPage.tsx`, `MissionControlPage.tsx`, `AppShell.tsx`

**Reports:**
- `reports/commercial-beta-readiness-report.md` — full beta readiness assessment

### What to do next (user actions — cannot be automated)

1. **Run `stage-deps.yml`** manually from GitHub Actions → populates `v-deps-1.0.0` release with 4 assets
2. **Merge PR #9** after CI passes
3. **Push tag `v1.0.0-beta.1`** → triggers `build-installer.yml` → produces `FactumIL_v1.0.0_Setup.exe`
4. **Test on clean Windows machine** per checklist in `reports/commercial-beta-readiness-report.md`
5. **Code signing** — get Windows Authenticode cert for v1.0.1 (SmartScreen warning on unsigned EXE)

### What to do next (code — future phases)

- **Phase 11: Update delivery** — when `v-deps-*` pattern is established, publish a `manifest.json` per channel to GitHub Releases so `GET /api/updates/app-check` finds real updates
- **RBAC v2** — add `CaseAssignments` table (hook point in `case-isolation-domain.ts`)
- **AgentExecutionEvents API** — `GET /api/admin/journal` for dashboard visibility
- **vec_chunks backfill** — one-time migration for existing ChunkEmbeddings rows

## Migration Slots Used
001–039: core schema, CRM, academic hub, FTS5, security, observability
040: Metrics
041: EventStore + EventHandlerLog + DeadLetterQueue
042: Entities + EntityRelations (legal-ontology)
043: CaseMemory + UserPreferences + AgentRunLog
044: DocumentChunks + ChunkEmbeddings + fts_document_chunks
045: AgentResults
046: ProceduralChecklist + RiskAssessments
047: DocumentVersions + Annotations
048: DocumentSignatures
049: WorkflowStates + WorkflowIdempotencyLog + AgentRunRegistry
050: PipelineLogs
051: VacuumSessions
052: vec_chunks (SKIP_ON_ERROR)
053: AgentExecutionEvents
054: SystemEvents

Next available: **055**

## CI Status
All checks pass (2026-05-26):
- `pnpm -r typecheck` ✓ (0 errors, 25 packages)
- `pnpm -r test` ✓ (347+ tests, 0 failures)
- `pnpm --filter @factum-il/evals eval` ✓ (eval regression passed)
- Pre-commit hook: ✓ (typecheck on changed packages)

## Production Build Pipeline Fixes (2026-05-27)

### Completed this session

**PR #19 — CS0051: StartupValidator accessibility (merged)**
- `FactumIL.Desktop/StartupValidator.cs` — `internal sealed class` → `public sealed class`
- Root cause: `DiagnosticsService.RecordStartupDiagnosticAsync` (public method, public class) took a parameter
  of type `StartupValidator.ValidationResult`. The nested record was `public` but the enclosing class was
  `internal`, making the nested type's effective accessibility `internal` → CS0051 at `dotnet publish`.
- Allowed `pnpm build:installer` to advance past step 7 (dotnet publish) for the first time.

**PR #20 — Copy-Item file lock retry in publish.ps1 (merged)**
- `publish.ps1` workspace dist copy loop — bare `Copy-Item` replaced with 3-attempt retry (800 ms back-off)
- Root cause: `@factum-il/shared/dist/diagnostics/index.d.ts` locked by VS Code TypeScript server or
  Windows Defender during `Copy-Item -Recurse -Force`. With `$ErrorActionPreference = 'Stop'`, the first
  locked file terminates `publish.ps1` non-zero → outer `pnpm build:installer` reports `ELIFECYCLE exit 1`.
- The retry loop handles transient locks transparently; persistent locks still surface after 3 attempts.

**PR #22 — Step 8 complete rewrite: artifact copy + flat pnpm install --prod (merged)**
- Root causes: (1) VS Code TS-server held persistent file locks on `packages/shared/dist/*.d.ts`
  — 3-retry loop was insufficient. (2) `pnpm deploy --prod` created deep `.pnpm/vite@8.0.13_…`
  content-store paths exceeding Windows 260-char MAX_PATH → bin-shim WARN/failures.
- Fix: kill `node.exe` first (releases locks), drop `pnpm deploy`, build a merged `package.json`
  collecting all third-party deps from API + all workspace packages (captures `better-sqlite3`,
  `sqlite-vec` etc. transitively), write `.npmrc` (`node-linker=hoisted`) + empty
  `pnpm-workspace.yaml`, run `pnpm install --prod --no-lockfile --node-linker=hoisted --prefer-offline`
  → flat `node_modules/` with no deep symlink tree.
- Bonus fix: `litigation-intelligence` was missing from `$PackageBuildOrder` (step 6) and
  `$WorkspacePackages` (step 8) despite being a direct `workspace:*` dep of `@factum-il/api`;
  added to both. Added `"build": "tsc"` script to `packages/litigation-intelligence/package.json`.

### What to do next

- **Run `git pull origin main && pnpm build:installer`** on Windows — PRs #19, #20, #22 all merged.
  Steps 7 and 8 should now complete cleanly (no file locks, no deep-path errors).
- **If step 8 passes but step 9/10 fails:** report the step number and error output.
- **If all 10 steps complete:** verify `FactumIL_Dist\FactumIL_v1.0.0_Setup.exe` exists and install
  on a clean Windows VM for end-to-end smoke test.
- **Remaining planned work:** Production Polish (installer metadata, port discovery, DB shield),
  Coverage & Chaos Tests, Build Environment Fixes (.nvmrc, START.cmd)
