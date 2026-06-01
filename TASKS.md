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

## Build Pipeline Fixes — Round 2 (2026-05-30)

### Completed this session

**PR #29 — allow-build in .npmrc (reverted/superseded)**
- ניסיון ראשון: `allow-build=better-sqlite3` ב-`.npmrc` — מפתח לא חוקי ב-pnpm, לא תיקן.

**PR #30 — pnpm.onlyBuiltDependencies ב-package.json (reverted/superseded)**
- ניסיון שני: `pnpm.onlyBuiltDependencies` ב-`package.json` — pnpm 11 התעלם עם WARN, לא תיקן.

**PR #31 — onlyBuiltDependencies ב-backend pnpm-workspace.yaml (reverted/superseded)**
- ניסיון שלישי: `onlyBuiltDependencies` ב-`pnpm-workspace.yaml` של ה-backend — pnpm קרא מ-ROOT workspace, לא מהתיקייה המבודדת.

**PR #32 — `--ignore-scripts` + `npm rebuild better-sqlite3` + overrides (merged)**
- פתרון סופי ל-`ERR_PNPM_IGNORED_BUILDS`:
  - `pnpm install --prod --ignore-scripts` עוקף את חסימת pnpm לגמרי
  - `npm rebuild better-sqlite3` מריץ את ה-native build עם Node שמותקן ב-מכונה
  - `overrides: better-sqlite3: "^11.0.0"` ב-`pnpm-workspace.yaml` — מבטיח גרסה עם Node-22 prebuilt
  - self-verification: `node -e "require('better-sqlite3')"` בסוף שלב 8

**PR #33 — Add-Member -Force לתיקון exports בשלב 8.6 (merged)**
- שגיאה: `Exception setting "exports"` — PowerShell לא יכול להצמיד property חדש ישירות ל-PSCustomObject
- תיקון: `$pkgJson | Add-Member -NotePropertyName 'exports' ... -Force`

**PR #34 — URLs רשמיים לשלבים 10-11 (merged)**
- שגיאה: `Invoke-WebRequest : Not Found` — release `v-deps-1.0.0` לא קיים בריפו
- תיקון: nodejs.org, ollama.com, go.microsoft.com, huggingface.co — כולם URLs רשמיים ציבוריים

### What to do next

- **הרץ על Windows:** `git pull origin main && .\publish.ps1`
- **שלבים 1-9** — אמורים לעבור (תוקנו ב-PRs קודמים)
- **שלב 10** — יוריד `node.exe` מ-nodejs.org (≈30 MB)
- **שלב 11** — יוריד Ollama, WebView2, GGUF (~1.3 GB); הורדת GGUF ארוכה — המתן
- **שלב 12** — `ISCC.exe installer.iss` → `Factum-IL-Setup.exe`
- אם שלב 11 נכשל בגלל GGUF: לא שגיאה קריטית — המודל יורד מ-Ollama Hub בהפעלה ראשונה
- אם כל 12 השלבים עברו: התקן על מכונת Windows נקייה ובדוק smoke test

**PR #35 — תיקון שם exe ו-dashboard path בסיכום (merged)**
- `FactumIL.Desktop.csproj`: `AssemblyName` FactumIL → FactumIL.Desktop כדי ש-`dotnet publish` ייצר `FactumIL.Desktop.exe` כפי שמצפה `installer.iss`
- `publish.ps1` סיכום: `dashboard\index.html` → `dashboard\dist\index.html` (הסטייג'ינג מעתיק לתוך `dist\`)

**PR #36 — תיקון נתיב 8.3 ב-`$env:TEMP` שלב 10 (merged 2026-05-30)**
- שגיאה: `Remove-Item : An object at the specified path C:\Users\021A~1 does not exist.`
- גורם: שם משתמש עברי (`ניר`) גורם ל-Windows להחזיר נתיב 8.3 קצר מ-`$env:TEMP`
- תיקון: `$TempDir = (Get-Item -LiteralPath $env:TEMP).FullName` ממיר לנתיב ארוך מלא
- תיקון נוסף: `-ErrorAction SilentlyContinue` על `Remove-Item` למניעת קריסה על תיקייה שיורית

### What to do next

- **הרץ על Windows:** `git pull origin main && .\publish.ps1`
- כל 12 השלבים אמורים לעבור עכשיו:
  - שלב 8: `better-sqlite3` יותקן ויאומת (`--ignore-scripts` + `npm rebuild`)
  - שלב 10: `node.exe` יועתק ל-`runtime\` ללא שגיאת נתיב
  - שלב 12: `ISCC.exe installer.iss` → `Factum-IL-Setup.exe`
- לאחר בנייה מוצלחת: התקן על מכונת Windows נקייה ובצע smoke test

**PR #37 — תיקון `faDirectory` ב-installer.iss [Code] section (2026-05-30)**
- שגיאה: `Error on line 199 ... Unknown identifier 'faDirectory'. Compile aborted.`
- גורם: שורה 199 כתובה בסגנון Delphi/SysUtils — `faDirectory` לא קיים ב-Inno Setup, ו-`FindFirst` שם מקבל `TFindRec` (לא דגל attributes) ומחזיר `Boolean`
- תיקון: `FindFirst(DesktopDir + '\8.*', FindRec)` + `FindClose(FindRec)` — שימוש ב-Inno Setup API התקין
- זהו שלב 12 (ISCC); 11 השלבים של publish.ps1 כבר עוברים במלואם

---

## UX Modernization — Phase 0 planning (2026-05-31)

נכתבו תוכניות עבודה מעוגנות-קוד לכל ארבעת פריטי Phase-0 שנותרו ברואדמאפ
(`docs/UX-MODERNIZATION-ROADMAP.md` §5 Phase 0), בנוסף לתוכנית הניווט הקיימת
(`docs/IA-NAV-IMPLEMENTATION-PLAN.md`, §4.7.6).

מסמכים חדשים תחת `docs/`:
- `NOTIFICATIONS-INBOX-IMPLEMENTATION-PLAN.md` — §4.1.3 (תיבת התראות)
- `INSIGHT-VERIFICATION-IMPLEMENTATION-PLAN.md` — §4.2.1 (אימות תובנות AI)
- `AGENT-SSE-IMPLEMENTATION-PLAN.md` — §4.2.4 (זרימת שלבי-סוכן)
- `QUICK-ADD-PALETTE-IMPLEMENTATION-PLAN.md` — §4.6.1 + §4.6.4 (יצירה מהירה + פקודות Cmd+K)

**שני תיקונים לרואדמאפ שעלו מעיגון בקוד (חשוב לפני מימוש):**
1. §4.1.3 מסומן `[backend ready]`, אך אין טבלת `Notifications` ואין read-API —
   `notification-service.ts` הוא רק stub ל-WhatsApp. צריך migration 058 + גנרטור שמתמיד שורות.
2. §4.2.4 טוען ש"כל 5 הסוכנים חושפים /stream" — לא מדויק. קיים רק endpoint גנרי לטוקנים
   (`/api/ai/stream`). המימוש המומלץ: לפלוט אירועי-שלב לטבלת `AgentExecutionEvents`
   (mig 053, קיימת) ולהזרים אותם ב-SSE per-execution.
   הערה נוספת — §4.2.1: `findInsights` מחזיר שורה אחת לכל מסמך, לכן MVP הוא אימות ברמת-רשומה;
   אימות per-field דורש שינוי סכמה (נדחה).

### What to do next
- כל תוכנית כוללת: קבצים לשינוי, reuse, סיכונים, ואימות.

## תיבת התראות (§4.1.3) — מומשה (2026-05-31)

מומש הפריט הראשון מתוך תוכניות Phase-0 — אינבוקס התראות מלא (backend → UI):

**Backend:**
- `migrations/058_notifications.sql` — טבלת `Notifications` (additive, `dedup_key` UNIQUE לאידמפוטנטיות).
- `packages/database/src/queries/notifications.ts` — `NotificationsRepository`
  (`upsert` עם `ON CONFLICT DO NOTHING`, `listRecent`, `unreadCount`, `markRead`, `markAllRead`)
  + ייצוא ב-`index.ts`. בדיקות: `notifications.test.ts` (5 עוברות).
- `Repos` (`db.ts`) + בנייה ב-`start.ts`.
- `packages/api/src/routes/notifications.ts` — `GET /api/notifications`, `POST /:id/read`,
  `POST /read-all`; רשום ב-`app.ts`. עוקב אחר תבנית local-first (ללא requireAuth, כמו queue/tasks).
- גנרטורים מתמידים שורות ליד הקריאות הקיימות (WhatsApp/log נשמרו כמו שהם):
  `deadline-tracker-scheduler.ts` (task_due + statute_deadline, נשמר גם ללא טלפון) ו-
  `insolvency-nudge-scheduler.ts` (form5_gap).

**Frontend:**
- `apps/dashboard/src/api/hooks.ts` — `useNotifications` (polling 60s), `useMarkNotificationRead`,
  `useMarkAllNotificationsRead` + `QUERY_KEYS.notifications`.
- `components/notifications/NotificationBell.tsx` + `NotificationPanel.tsx` — פעמון עם באדג'
  unread, popover עם deep-links, סמן-כנקרא / סמן-הכל. נטען ב-`AppShell` (top bar חדש).

**אימות:** database (30 בדיקות), api app.test (14), dashboard typecheck + production build — כולם ירוקים.

## ביקורת Phase-0 + Quick-Add/פקודות (§4.6.1+§4.6.4) — מומש (2026-05-31)

**ממצא ביקורת חשוב:** בעת המעבר לפריטים הבאים התגלה שהקוד מקדים את הרואדמאפ —
שני פריטי Phase-0 כבר ממומשים בליבתם, בניגוד למה שהרואדמאפ והתוכניות הניחו:
- **§4.2.1 (אימות תובנות):** כבר קיים ב-`DocumentDetail.tsx` — `useDocumentInsights` +
  `useVerifyInsight`, תצוגת שדות, פס-ביטחון, תג `verification_state`, וכפתורי אשר/דחה.
  נותר (נדחה): עריכה inline לפני אישור, אימות per-field (דורש שינוי סכמה), "אשר הכל מעל 85%".
- **§4.2.4 (SSE סוכנים):** כבר קיים — `agentsStreamRouter` עם 5 endpoints `/stream` +
  `useAgentStream` (EventSource). ה-progress גס (5%→20%→100%). נותר (נדחה): granularity של
  5 השלבים — דורש token-streaming מ-Ollama וקשה לאמת ללא Ollama רץ.
- הבאנרים עודכנו בראש שני מסמכי-התוכנית בהתאם.

**מומש §4.6.1+§4.6.4 (Quick-Add + פקודות בלוח-הפקודות):**
- `apps/dashboard/src/commands/command-registry.ts` — `COMMANDS` (צור תיק/לקוח/משימה) +
  `matchCommands` (תמיכה בקידומת `>`, התאמה לפי תווית/keywords). **7 בדיקות יחידה.**
- `SpotlightSearch.tsx` — מקטע "פקודות" משולב בניווט-המקלדת (selectables מאוחד: פקודות→תוצאות),
  dispatcher `activate`, `CommandRow`. הפקודות מנווטות עם `?new=1`.
- `useSpotlight.ts` — קיצור גלובלי **"n" / "+"** ל-Quick-Add (מושתק בתוך שדות קלט).
- `CasesPage` / `ClientsPage` / `TasksPage` — קוראים `?new=1` ופותחים את **הטופס הקיים**
  (reuse מלא, ללא טפסים חדשים וללא העברת state גלובלי).
- time-entry הושמט בכוונה עד §4.1.5 (חיוב). dashboard typecheck + build ירוקים.

## שדרוג ניווט/IA (§4.7.6) — מומש (2026-06-01)

הסרגל הצדי שודרג מ-6 פריטים שטוחים + תפריט הגדרות ל-**אקורדיון 8 קבוצות** שחושף את כל
~25 ה-routes. אומת ש-CI ירוק על PR #44 לפני תחילת העבודה.

- `components/layout/nav-config.tsx` (חדש) — `NAV_GROUPS` (8 קבוצות, כל פריט route קיים),
  `DEFAULT_EXPANDED`, `ALL_NAV_ITEMS`, `groupIdForPath` (longest-prefix). כל 33 אייקוני
  Phosphor אומתו מול node_modules לפני הכתיבה.
- `store/index.ts` — נוספו `expandedGroups` + `toggleNavGroup`/`setNavGroupOpen` ו-middleware
  `persist` (`partialize` → `{sidebarCollapsed, expandedGroups}`, `merge` מזריע דיפולטים
  לקבוצות חדשות; שם store `factum-il-ui`).
- `Sidebar.tsx` (נכתב מחדש) — אקורדיון במצב מורחב, מסילת-אייקונים שטוחה עם מפרידים במצב מכווץ,
  הרחבה-אוטומטית של הקבוצה הפעילה (`useLocation`), "דווח על באג" הועבר לקבוצת מערכת.
  נשמרו: סמל המותג, כרטיס Ollama, כפתור הכיווץ. ה-router לא שונה.
- בדיקות: `__tests__/Sidebar.test.tsx` (5). dashboard: 23 בדיקות, typecheck + build ירוקים.

## שיפורים נדחים של Phase 0 — טופלו (2026-06-01)

לאחר אימות CI ירוק על `6b1669e`, טופלו השיפורים הנדחים:
- **§4.2.1 עריכה inline** — `PATCH /api/documents/insights/:id` + `updateInsightFields`
  (6 בדיקות) + מצב עריכה ב-`DocumentDetail`. (per-field confidence + bulk-approve הושארו
  נדחים בכוונה: המודל פולט confidence יחיד → UI per-field יזייף מספרים; bulk צריך את מסך
  הסקירה §4.2.2 ב-Phase 1.)
- **התראות auto-resolve + העדפות** — migration 059 (`resolved_at`), reconcile בסקדיולרים
  (משימה checked/cancelled, תיק לא-open, filing שעזב Pre_Filing), והשתקת סוגים client-side
  בפאנל. (notifications: 7 בדיקות.)
- **§4.2.4 התקדמות שלבי-ריצה** — `onProgress` ב-`runAgent` (gathering→context→analyzing→
  validating) דרך 5 ה-wrappers וה-`/stream`. (agent-progress: 3 בדיקות.) ה-rail של 5 שלבי-
  ההנמקה לא נבנה בכוונה — המודל מחזיר JSON בלבד (אין סמני-שלב לפרסר), ושינוי זה מסכן את
  הפלט המכויל ודורש Ollama חי לאימות.

## Phase 1 — לוח שנה / דוקטינג (§4.1.1) — מומש (2026-06-01)

הפריט הראשון והבכיר ב-Phase 1 (מונע סיכון malpractice). אומת ש-CI ירוק על `f49a7f7` לפני.

- `packages/database/src/queries/calendar.ts` — `CalendarRepository.eventsInRange(from,to)`
  מאחד שלושה מקורות: `court_hearings`, מועדי התיישנות (`Cases.statute_deadline`, status=open),
  ומשימות פעילות (`Tasks.due_date`, pending/in_progress). מנרמל ל-`CalendarEvent`. 5 בדיקות.
- `Repos` + `start.ts` + `GET /api/calendar/events?from=&to=` (`routes/calendar.ts`, ולידציית תאריך).
- `useCalendarEvents` hook; עמוד `features/calendar/CalendarPage.tsx` — רשת חודשית RTL,
  תצוגת אג׳נדה, ריל "מועדים קרובים (30 יום)", צ׳יפים צבועים לפי סוג (דיון/התיישנות/משימה),
  קליק→ניווט לתיק. route `/calendar` + פריט ניווט "יומן" בקבוצת "עבודה שוטפת".

## Phase 1 — קורא/מציג מסמכים (§4.1.2) — MVP מומש (2026-06-01)

המשתמשים יכולים סוף-סוף *לקרוא* מסמך בתוך האפליקציה (היה "partial backend" — לא היה endpoint
להגשת קובץ). אומת CI ירוק על `e117c55` לפני.

- `GET /api/documents/:id/file` — מגיש את הקובץ המקומי (mime מ-`mime_type`/סיומת,
  `inline` + `nosniff`, ולידציית קיום קובץ). מקומי בלבד.
- `features/documents/DocumentReader.tsx` + route `/documents/:id/read`:
  PDF → `<iframe>` (PDF נייטיב של WebView2, בלי pdfjs כבד); תמונה → `<img>` עם זום;
  אחר → הודעה + הורדה. טוגל "טקסט OCR" (2 עמודות), הורדה, קישור לתובנות AI.
- כפתור "קרא מסמך" נוסף ל-`DocumentDetail`.

### What to do next — המשך Phase 1
- §4.1.2 הרחבות (נדחו): שכבת-הערות אינטראקטיבית (`AnnotationRepository` קיים), ספירת
  עמודים/חיפוש-ב-PDF (דורש pdfjs), מיזוג קורא+תובנות+חתימה למסך אחד.
- §4.4.3 מוניטור מועדים/SLA + §4.7.1 חשיפת מנוע-הכללים (משלימים את היומן).
- §4.2.2 תור סקירה + לולאת תיקון (כולל bulk-approve שנדחה מ-§4.2.1).
- שיפור יומן: תצוגות שבוע/יום, מילסטונים מ-CaseProcedures, ייצוא אג׳נדה להדפסה.
