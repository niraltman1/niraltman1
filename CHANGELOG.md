# Changelog

All notable changes to Factum IL are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Installer remediation + full corpus bundling] — 2026-06-20
PRs #130, #136 (+ download hotfixes #131–#133, Supreme Court ingest encoding fix #135)

### Fixed
- **Installer hang on a clean machine** — `installer.iss` no longer runs `ollama create` (model registration) synchronously during install (`[Run]` Steps 3–4 removed). Install now completes in seconds; model registration moved to a resumable first-launch step in the WPF shell (PR #130).
- **Installer build: model / corpus / WebView2 release-asset downloads 404'd** — `publish.ps1` now authenticates GitHub release-asset downloads (Bearer token via the API asset URL) and uses `curl.exe` with retries for the ~941 MB GGUF; the build now fails fast if a required asset is missing instead of silently producing an installer without the model (PRs #130, #131–#133).
- **Supreme Court corpus garbled text** — CP1255→Latin-1 encoding recovery bug fixed in the LevMuchnik ingest (PR #135).

### Added
- **Resumable first-launch bootstrap** — `FactumIL.Desktop/BootstrapManager.cs` plus `RetryPolicy`, `OllamaLifecycle`, `SafeModeManager`, `FunctionalHealthChecks`, `StartupLogger`: atomic state file (`.tmp`→validate→rename), numeric step IDs with version reconciliation, named-mutex single-instance, early Safe Mode on first recoverable AI-infra failure, per-step telemetry. The API readiness wait is now non-fatal — it routes to `RecoveryWindow` instead of `Shutdown(1)` (PR #130).
- **Supreme Court (LevMuchnik/SupremeCourtOfIsrael) corpus bundled end-to-end** — `publish.ps1` stages `supreme-court-il.jsonl.gz` + `supreme-court-metadata.json` from `v-corpus-latest`; `installer.iss` bundles them; `verdict-corpus-loader.ts` now loads BOTH guychuk and Supreme Court datasets into `VerdictCorpus` (separate idempotency/resume keys, namespaced docKeys). New `verdict-corpus-loader.test.ts` (PR #136).
- **Non-technical Hebrew local-build guide** in `README.md` — step-by-step to build `Factum-IL-Setup.exe` and install it without GitHub Actions (winget toolchain, Hebrew.isl, GitHub token, `publish.ps1` + ISCC, first-launch bootstrap, troubleshooting) (PR #136).
- `/api/health/functional` fast tier — embedding probe removed; the desktop shell probes the model directly (PR #130).

### Changed
- `scripts/register-ollama-model.ps1` is now a manual / recovery tool with a bounded `ollama create` timeout (no longer invoked by the installer) (PR #130).

### Known limitations
- **GitHub Actions (CI + `build-installer.yml`) is currently blocked by the account's billing / spending-limit** — jobs fail at startup with no runner assigned (`runner_id: 0`, ~2 s, no logs). This is an account state, not a code issue. Workarounds: build the installer locally on Windows per the README, restore billing / wait for the monthly free-minutes reset, or use a self-hosted runner.
- The C# WPF shell compiles only on Windows (`net8.0-windows`); its first real compile happens during the local `publish.ps1` build.

---

## [Audit UX Round + B2/C7 Completion] — 2026-06-13
PRs #91, #94–#101

### Added
- **Audit UX #13** — Case-level notes tab (`'notes'`) in `CaseDetail`: compose textarea with Ctrl+Enter shortcut, per-note delete. Uses existing `Tasks` table (`source: 'note'`) — no new endpoint (PR #99).
- **Audit UX #1–#12, #14–#20** — 19 additional items completed across PRs #94–#98:
  - Global search (`/search`) wired to FTS5 results with grouping + highlight (PR #94).
  - Legal corpus browser (`/library`) tabs: legislation + case-law (PR #94).
  - Matter workbench button on every case card (PR #94).
  - Citation harvest button in `DocumentDetail` (PR #94).
  - Stored agent results (`GET /api/agents/results`, PR #94).
  - Document version history + AI insight batch review + citations page (PR #95).
  - Entity graph (SVG, D3-free) + unified agent URL-param experience (PR #96).
  - PDF and Word export (`jspdf` + `docx`, `ExportMenu`, PR #97).
- **B2 — Stens seed data:** migration 078 — 8 real Hebrew legal form templates in `StensTemplates` (small claims, civil pleading, divorce, maintenance, labour, admin appeal, traffic fine, bail bond) (PR #101).
- **B2 — Saved Filters (Smart Collections):** migration 079 — `SavedFilters` table + `SavedFiltersRepository`; 4 API routes (`GET/POST /api/collections/saved`, `DELETE /saved/:id`, `GET /saved/:id/items`); `SmartCollectionsPage` extended with custom filter pills (create, activate, delete) (PR #101).
- **B2 — legal-engine learning mode:** `POST /api/legal-engine/learn` — regulation document parsed by `regulation-parser.ts`; Ollama graceful fallback on parse error (PR #101).
- **C7 — SLA Radar:** `sla-radar-scheduler.ts` — hourly scheduler (configurable via `COMM_SLA_HOURS`, default 4h); queries `CommMessages WHERE direction='inbound' AND handled=0`; creates `warning`/`critical` in-app notifications with idempotent `dedupKey: 'sla:conv:<id>'`; auto-resolves when conversation is handled (PR #101).
- QA Phase 2: Windows CI job (`check-windows`), PowerShell/Pester CI job, Playwright E2E golden tests (8 tests) (PR #91).

### Fixed
- Flaky timing test in `packages/update-core` — `waitForDbUnlock` threshold raised from 200ms to 1000ms for slow Windows runners (PR #99).
- FTS5 alias bug: `WHERE fts MATCH ?` corrected to `WHERE fts_documents MATCH ?` (PR #91).
- FTS5 parenthesized-OR syntax rejected by SQLite — flattened to `A* OR B*` form (PR #91).
- Cache poisoning in `cacheResults` — only caches when `ranked.length > 0` (PR #91).

### Known limitations (unchanged)
- WhatsApp manual-send (C2) requires self-hosted `whatsapp-web.js` with local WebView2/Edge — environment-blocked, documented caveat.
- Telegram live delivery and local Whisper transcription require user-machine network access.
- packages דקיקים (`orchestrator`, `sdk`, `encrypted-backup`, `enterprise-hooks`) — awaiting owner decision.

---

## [Beta Readiness — v1.0.0-beta.1 candidate] — 2026-06-10
PRs #52, #55, #58, #63, #67, #68, #70–#74, #76

### Added
- Migration 068 — `ai_urgency` / `ai_tags` columns on `CommMessages`; smart triage of inbound messages via local law-il-E2B (Ollama-graceful), urgency badge + AI tag pills in `MessageBubble` (C7).
- Migration 069 — verdict-corpus KB foundation: verbatim Israeli case-law tables (#52).
- Migration 070 — enhanced precedent library; `JudgmentLibraryPage` (ספריית פסקי דין) with categorized sidebar, full-text viewer, and selection citation context menu (#67).
- Migrations 071–072 — unified legal drafting workspace: `DraftsRepository`, 18 API endpoints, TipTap `DraftEditor`, shelf system, `InsolvencyPage`; shared `legal-terms.ts` dictionary + `SharedComponents` (F-C) (#68).
- Migrations 073–077 — legal-brain Phase 1: conversational research assistant with SSE streaming, session persistence, Ollama-graceful fallback (#71).
- `POST /api/communications/unknown/:id/convert` — unknown-sender → client conversion: creates/links client, links channel identity, marks inbox row resolved, audited; inline pre-filled conversion form in `CommunicationsInboxPage` (C8).
- `/library` route — unified legal library with two tabs: חקיקה (`LegalCorpusPage`) and פסיקה (`JudgmentLibraryPage`) (F-B) (#76).
- Dashboard-first UX: new `DashboardPage` daily workbench (today's agenda, deadlines-at-risk, requires-attention tiers, active cases, KPI strip) + business-domain navigation (8 groups) (#70 + follow-up).
- Shared `AiApprovalBar` (אשר/דחה/עריכה) across `WorkbenchInsights`, `DocumentDetail`, `AgentOutputPanel` (F-F) (#73).
- Print stylesheet (`@media print`), skip-link, aria-labels (F-G a11y) (#74).
- `LegalSectionEmbeddings` wired into hybrid search + research agent (B1) (#58).
- 45 CodeQL path-traversal fixes (CWE-22) (#63).
- Dashboard test coverage expanded from 4 to 15+ test files.

### Changed
- Notification policy locked: in-app only via `NotificationsRepository`; `notification-service.ts` console.log stub replaced with silent no-op (B3) (#73).
- `build-installer.yml` — artifact/release path fixed to `Factum-IL-Setup.exe`; `publish.ps1` step 9 now downloads all `batch-*.jsonl.gz` + `corpus-domain-index.json` from release `v-corpus-latest` into `FactumIL_Dist\legal-corpus\batches\` (#73).
- Vacuum-protocol robustness: image support, Israeli case validation, collision detection (#55).

### Known beta limitations
- WhatsApp manual-send (C2) requires self-hosted `whatsapp-web.js` with local WebView2/Edge `executablePath` — environment-blocked, documented caveat.
- C7 SLA radar — completed in PR #101 (see above).
- C8 professional-contact path deferred post-beta.
- Telegram live delivery and local Whisper transcription require user-machine verification.

---

## [Rules Engine + Entity Graph + Legal Corpus] — 2026-06-03
PRs #48–#53

### Added
- Migration 054 — `Rules_Engine` table seeded with 20 Israeli procedural rules across 9 procedure types (תביעה אזרחית, פלילי, עבודה, משפחה, מנהלי, חדלות פירעון, תעבורה, ביטוח לאומי, בג"ץ). Deadline logic is always read from the database — never hardcoded.
- Migration 055 — `Entities` and `EntityRelations` tables (entity knowledge graph). Entities are populated during RAG enrichment: persons, organizations, court names, statutes, and case identifiers are extracted from each document and linked.
- Migration 060 — `EntityEnrichmentLog` to track which documents have had entity extraction applied.
- Migrations 056–059 — Offline legislation corpus: `CorpusDocuments`, `CorpusChunks` (FTS5 + sqlite-vec), `KnessetBills`, `KnessetVersions` (Knesset OData), `WikiSourcePages` (WikiSource), `CitationLinks` (citation graph edges).
- `packages/retrieval` — hybrid offline legislation corpus ingestion pipeline (Knesset OData × WikiSource); graceful fallback when government endpoints return 403.
- `/rules` API route — query, filter, and evaluate Israeli procedural rules from `Rules_Engine`.
- `/citations` route extended — citation graph traversal via `CitationLinks` table.

### Changed
- RAG Worker now populates `Entities` / `EntityRelations` tables during document enrichment cycle.
- `EntityEnrichmentLog` tracks enrichment state to avoid re-processing.

---

## [UX Modernization Phase 0+1] — 2026-05-31
PRs #44–#49

### Added
- Notifications inbox (`/notifications` API route + dashboard panel) — real-time in-app notifications for pipeline events, agent completions, and deadline alerts.
- Quick-add palette — keyboard-triggered (Cmd/Ctrl+K) command palette for fast case, client, and document creation.
- Navigation accordion (8 groups): ראשי, תיקים, לקוחות, מסמכים, לוח שנה, סוכנים, כלים, מערכת.
- Calendar view (`/calendar` API + dashboard page) — court hearings, deadlines, and reminders drawn from `CourtHearings` table.
- Document viewer — in-app PDF/image viewer with annotation support; annotations persisted to `Annotations` table (see `/annotations` route).
- Legal workbench (`/workbench/legal` API + dashboard page) — unified workspace combining document viewer, agent invocation, citation lookup, and annotation tools for a single case.

### Changed
- Sidebar navigation rebuilt as collapsible accordion with RTL support and active-state indicators.
- Dashboard landing page updated to surface notifications count, upcoming hearings, and recent agent runs.

---

## [First-Run Fixes + sqlite-vec] — 2026-05-28
PRs #38–#43

### Added
- `sqlite-vec.dll` download step added as step 11 of `publish.ps1`; DLL is bundled in `FactumIL_Dist\tools\`.
- `SQLITE_VEC_PATH` registry entry set by installer at machine level (HKLM); `DatabaseConnection` reads this env var at startup to load the extension before any query runs.
- `FACTUM_IL_VERSION` registry entry added to installer `[Registry]` section; surfaced at runtime via `/diagnostics` endpoint and in the WPF title bar.
- Migration runner hardening: PRAGMA statements (`journal_mode`, `foreign_keys`, `auto_vacuum`) are now emitted before `BEGIN TRANSACTION`, fixing failures on SQLite versions that reject PRAGMA inside a transaction.
- UTF-8 BOM injection (step 12 of `publish.ps1`) extended to cover all PowerShell scripts staged in `FactumIL_Dist\powershell\` — prevents Windows `cmd.exe` garbling Hebrew console output.

### Fixed
- First-run crash when `_data/` directory does not exist: `mkdirSync` guard added to `packages/api/src/start.ts` before opening the database.
- sqlite-vec KNN queries failing on fresh installs because `SQLITE_VEC_PATH` was not resolved: now read from environment/registry with a clear error if missing.

---

## [Build Pipeline Round 2] — 2026-05-26
PRs #29–#37

### Added
- `OLLAMA_BASE_URL` registry entry: installer writes `http://127.0.0.1:11434` at machine level so the API and desktop shell always agree on the Ollama endpoint without manual configuration.
- `FACTUM_IL_VERSION` env var: written by installer, read by API at startup, returned in `/diagnostics` response and `X-Factum-Version` response header.
- `packages/update-core` — auto-update check against GitHub Releases manifest; `UpdateLog` (migration 021) and `UpdateChannels` / `UpdateManifest` (migration 051) tables.
- `packages/encrypted-backup` — AES-256-GCM scheduled backup pipeline; `BackupManifest` and `RecoveryLog` (migration 052) tables; hourly schedule when `BACKUP_ENCRYPT=1`.
- `packages/support-diagnostics` — crash reporting, health diagnostics snapshot, safe-mode coordinator; `SupportTickets` and `DiagnosticsSnapshot` (migration 053) tables.
- RecoveryWindow (`/recovery` route) — available in safe mode (`FACTUM_IL_SAFE_MODE=1`) for guided database restore.
- Migrations 040–053: EventsLog, ObservabilityMetrics, RBACRoles/Permissions/UserRoles, AgentRuns, CaseExecutionContexts, VectorChunks, RetrievalCache, MemorySnapshots, GuardrailsLog, EvalResults, LitigationScores, UpdateChannels/Manifest, BackupManifest/RecoveryLog, SupportTickets/DiagnosticsSnapshot.

### Fixed
- `publish.ps1` step ordering corrected so `dotnet publish` (step 7) runs after all TypeScript builds complete.
- Backend staging (step 8) now prunes devDependencies from `node_modules` before copying to `FactumIL_Dist\backend\`.

---

## [Build Pipeline Round 1] — 2026-05-23
PRs #19–#22

### Added
- `publish.ps1` — 12-step staging pipeline replacing the earlier 4-step `apps/desktop/publish.ps1`. Produces the complete `FactumIL_Dist\` layout consumed by `installer.iss`.
- `installer.iss` rewritten as the canonical Inno Setup 6 production script: `AppId`, `AppName="Factum-IL"`, 8 `[Registry]` entries, `[Run]` section for Ollama install and first-run setup, `[Code]` section for .NET 8 check, WebView2 check, and legal-documents directory wizard page.
- `packages/events` — in-process typed event bus (publish/subscribe). EventsLog persistence (migration 040).
- `packages/observability` — structured logging, metrics, PII-safe log sinks. ObservabilityMetrics table (migration 041).
- `packages/model-router` — Ollama health-check wrapper with graceful degradation.
- `packages/policy-engine` — RBAC policy evaluation. RBACRoles/Permissions/UserRoles tables (migration 042).
- `packages/memory` — per-case conversation memory. MemorySnapshots table (migration 047).
- `packages/retrieval` — sqlite-vec KNN + FTS5 hybrid search. VectorChunks table (migration 045), RetrievalCache (migration 046).
- `packages/ai-guardrails` — input/output safety filters, PII detection, attorney-client privilege protection. GuardrailsLog table (migration 048).
- `packages/evals` — AI evaluation harness and regression fixtures. EvalResults table (migration 049).
- `packages/orchestrator` — multi-agent task orchestration.
- `packages/agent-core` — base agent interface, tool registry, CaseExecutionContext.
- `packages/litigation-intelligence` — litigation analytics, deadline risk scoring. LitigationScores table (migration 050).
- `packages/enterprise-hooks` — extension points for enterprise customization.
- `packages/legal-ontology` — Israeli legal taxonomy, court hierarchy, procedure type definitions.
- `packages/sdk` — public TypeScript SDK for external integrations.
- 5 agent routes: `/agents/summarize`, `/agents/timeline`, `/agents/research`, `/agents/contract-review`, `/agents/discovery`. AgentRuns table (migration 043), CaseExecutionContexts (migration 044).

### Changed
- `OLLAMA_MODEL` env var now set to `BrainboxAI/law-il-E2B:Q4_K_M` (not `legal-brain` alias). All references to `legal-brain` removed from codebase.
- AI tier decision (`AI_TIER`) is now `high` only — project uses a single model, no tier-based model switching.

---

## [Phase 11 — Production Finalization] — 2026-05-20

### Added
- `FactumIL.Desktop/Resources/icon.ico` — ICO file was absent after the `Factum-IL.Desktop/` → `FactumIL.Desktop/` directory rename; the file is now present (MD5 ef38df67, identical to `assets/logo/factum-il-icon.ico`).

### Fixed
- `.gitignore` — added `FactumIL.Desktop/bin/`, `FactumIL.Desktop/obj/`, and `FactumIL_Dist/` so generated C# and staging directories are no longer tracked.

---

## [Phase 10 — Complete Factum-IL → Factum IL Rebrand] — 2026-05-19

### Changed
- All remaining `Factum-IL` / `legal-os` / `Factum-IL.Desktop` strings removed from source, configs, and comments. Only `Factum IL` / `factum-il` / `FactumIL` is used hereafter.
- `apps/installer/FactumIL.iss` — added deprecation header; canonical production installer is now `installer.iss` at repo root.
- `packages/api/src/utils/legal-registry-loader.ts` — package path comment corrected to `// dist/utils → api → packages → factum-il`.
- `tools/ingest-legal-sources.mjs` — git command comment corrected to reference `main` branch (was `legal-os/...`).
- `installer.iss` — V13 production Inno Setup 6 script: `AppId={7A3F1B2C…}`, `AppName="Factum IL"`, `AppVersion=13.0`, sources all files from `FactumIL_Dist\` staging layout.
- `apps/desktop/publish.ps1` — csproj reference corrected to `FactumIL.Desktop.csproj`; added step [7.5/8] to copy `Legal_Registry.json`, `Config.ps1`, `User_Extensions/`, and `START-HERE.ps1` into `FactumIL_Dist/`.

---

## [Phase 9 — Uniform Citation Rules Compliance] — 2026-05-19

### Added
- `packages/citation-engine/src/__tests__/uniform-citation.test.ts` — 5 new compliance tests against the Nevo 2021 / כללי הציטוט האחיד standard: Supreme Court appeal, בג"ץ (פ"ד), legislation (ס"ח), regulations (ק"ת), and determinism. All 63 citation-engine tests pass.
- `packages/citation-engine/README.md` — documents the Nevo 2021 compliance guarantee, canonical output format table (case / law / regulation / book / article), and test coverage.
- `packages/api/src/utils/ingest-adapter.ts` — `IngestAdapter` interface abstracting `FileWatcher` for the document ingestion pipeline; allows alternate input sources (API upload, watched directory, Gmail attachment) to share the same `enqueue()` contract.

---

## [Phase 8 — Branding, Icon & Installer Readiness] — 2026-05-19

### Added
- `assets/logo/factum-il-icon.ico` — 7-layer ICO file (256/128/64/48/32/24/16 px, PNG-encoded frames, Vista+ compatible), 136 KB. Generated from the chess-knight-circuit-board logo with manual ICO encoder.
- `installer.iss` (root) — complete rewrite as the canonical V13 production Inno Setup 6 script. Covers: `[Files]` (shell, backend, dashboard, migrations, runtime, powershell/lib, scripts, optional tools, icon); `[Registry]` (`FACTUM_IL_ROOT`, `WHISPER_EXE`, `FFMPEG_EXE`, `OrgDirectory`); `[Run]` (Ollama install, `START-HERE.ps1 -Mode Installer -Silent`, optional app launch); `[Code]` triple-source `.NET 8` check, `NeedsOllama`, `NeedsWebView2`, `InitializeWizard` (legal documents directory page), `GetOrgDir`.
- `apps/desktop/publish.ps1` — added step [7.5/8]: stages `powershell/lib/Legal_Registry.json`, `Config.ps1`, `User_Extensions/` `.gitkeep`, and `apps/installer/START-HERE.ps1` into `FactumIL_Dist/`.

### Changed
- `FactumIL.Desktop/FactumIL.Desktop.csproj` — `<ApplicationIcon>Resources\icon.ico</ApplicationIcon>` now resolves to the real 7-layer ICO.
- `apps/desktop/FactumIL.Desktop.csproj` (`publish.ps1` pipeline variant) — AssemblyName correctly set to `FactumIL.Desktop`.

---

## [Phase 7 — Legal Brain: Registry, Deadline Tracker & Workspace Launcher] — 2026-05-19

### Added

**Legal Registry**
- `powershell/lib/Legal_Registry.json` — 126-entry offline Israeli court case taxonomy, seeded from the Net HaMishpat classification scheme. Schema: `metadata` (version, source, last_updated), `case_types[]` (126 records with `id`, `name_he`, `name_en`, `prefix`, `procedure_domain`, `deadline_days`, `statute`), `procedure_domains{}`.
- `packages/api/src/utils/legal-registry-loader.ts` — `initRegistry()`, `lookupPrefix(prefix)`, `tagManualReview(caseId)`, `tagMapped(caseId)`. Reads `Legal_Registry.json` from `node:fs` (offline, no HTTP).
- `migrations/039_registry_status.sql` — `ALTER TABLE Cases ADD COLUMN registry_status TEXT CHECK(registry_status IN ('mapped','manual_review_required'))`. Cases that don't match a known prefix are tagged `manual_review_required`.
- `powershell/lib/User_Extensions/` — gitignored directory for user-supplied regulation text (deadline rule overrides); `.gitkeep` is force-tracked.
- `tools/ingest-legal-sources.mjs` — build-time script that fetches the Net HaMishpat case-type list; gracefully falls back to the 126-row embedded seed when gov.il returns 403 (offline or sandbox).

**Deadline Tracker**
- `migrations/028_court_hearings.sql` — `CourtHearings` table (`case_id`, `hearing_date`, `court_name`, `room`, `judge_name`, `notes`, `reminder_sent`).
- `migrations/029_insolvency_module.sql` — insolvency and debt-arrangement proceedings tables.
- `migrations/030_case_law_registry.sql` — `CaseLawRegistry` table for tagging precedents to open cases.

**Workspace Launcher**
- `powershell/scripts/11-Open-Workspace.ps1` — per-case workspace launcher; reads `Cases` table to find the case folder under the branded office root, opens Windows Explorer at that path, logs the open event to `ActionLog`.

**Production Hardening (Steps 1–6, same sprint)**
- Step 1 — dynamic TCP port discovery: API server writes chosen port + PID to `%LOCALAPPDATA%\FactumIL\runtime\server_config.json`; WPF host reads this file before navigating WebView2.
- Step 2 — SQLite auto-vacuum strategy: `PRAGMA auto_vacuum = INCREMENTAL` set at DB open; `Invoke-VacuumProtocol.ps1` runs periodic `incremental_vacuum()`.
- Step 3 — PII log sanitisation: all log sinks strip Israeli ID numbers (9-digit), phone patterns (`05x`), and email addresses before writing to disk. RBAC session table and audit event ledger added.
- Step 4 — air-gap typography: Google Fonts CDN `<link>` tags replaced with locally bundled WOFF2 files; build-time version-stamp injected into installer, API, and dashboard.
- Step 5 — frontend UI compliance: 70-component React frontend fully RTL; settings sidebar with three-tier topology; Regulatory Compliance Banner certifying offline/air-gap mode.
- Step 6 — LLM-parsable feedback loop: local crash reporting engine; Whisper Hebrew audio transcription pipeline wired to Action Log.

**Migrations added in this sprint**
- 023 — `fix_search_meta_trigger` + `vacuum_sessions`
- 024 — `learning_feedback` + `pipeline_logs`
- 025 — `complex_crm_roles`
- 026 — `precedent_caching`
- 027 — `payment_ledger`
- 031 — `citation_registry`
- 032 — `contact_audit_clients_ext`
- 033 — `excel_import_sessions`
- 034 — `traffic_driving_license`
- 035 — `citation_engine`
- 036 — `security_compliance`
- 037 — `reliability`
- 038 — `civil_standard_procedure`
- 039 — `registry_status`

---

## [Phase 6 — TypeScript Hardening & Build Fixes] — 2026-05-11

### Fixed

**`apps/dashboard/src/router/index.tsx`**
- Removed non-portable inferred type for `router`. `createBrowserRouter` returns `RemixRouter`
  (from `@remix-run/router`), which TypeScript couldn't name without referencing the deep pnpm
  path. Added `@remix-run/router` as a devDependency and applied an explicit `Router` type import.
  This makes the type annotation stable and portable across different pnpm store layouts.

**`apps/dashboard/src/features/action-plan/ActionPlanPage.tsx`**
- Renamed `CircuitBoardIcon` → `CircuitryIcon` — the former doesn't exist in `@phosphor-icons/react`
  and caused a build-time "module has no export" error.
- Removed `title` prop from icon — not in `IconProps`, caught by strict prop checking.

**`apps/dashboard/src/features/clients/ClientCard.tsx`** /
**`ClientsPage.tsx`** / **`ClientTimeline.tsx`** /
**`features/admin/DiagnosticsPage.tsx`** / **`features/queue/QueueMonitor.tsx`**
- `{obj['key'] && <JSX>}` → `{!!obj['key'] && <JSX>}` everywhere.
  Root cause: `noUncheckedIndexedAccess: true` makes `obj['key']` return `T | undefined`,
  and `unknown | undefined` is not assignable to `ReactNode`. Converting to boolean (`!!`) produces
  `false | JSX.Element` which IS a valid `ReactNode`.

**`apps/dashboard/src/features/documents/DashboardPage.tsx`**
- Added missing `import type { IconWeight } from '@phosphor-icons/react'` so the `Icon` prop type
  in `StatCard` resolves correctly.
- `trend={cond ? val : undefined}` → `{...(cond ? { trend: val } : {})}` spread pattern.
  Required by `exactOptionalPropertyTypes: true` — assigning `undefined` to an optional prop is
  treated differently from omitting it entirely. The spread pattern omits the key rather than
  passing `undefined`, which satisfies the compiler.

**`packages/api/src/middleware/error.ts`**
- `notFoundHandler` was typed as `ErrorRequestHandler` (4 params: `err, req, res, next`), which
  caused TypeScript to infer `res` as `Request` (second parameter of the 4-param overload).
  Corrected to `RequestHandler` (3 params). This had no runtime impact but broke the type checker.
- Added automatic 409 detection for SQLite UNIQUE constraint violations (message contains
  `"UNIQUE constraint failed"`) so duplicate-record inserts surface as `ConflictError` without
  requiring manual try/catch in every route.
- `details` field now included in error response when present (carries Zod issue list for
  `ValidationError`, raw message for constraint errors).
- `stack` included in development mode (`NODE_ENV !== 'production'`) to speed up debugging.

**`packages/api/src/middleware/validate.ts`**
- `(req as Record<string, unknown>)` → `(req as unknown as Record<string, unknown>)`.
  TypeScript strict mode rejects a direct cast from `Request` to `Record<string, unknown>` because
  they are not overlapping types; the double cast via `unknown` is the standard bypass.

**`packages/api/src/utils/ollama-legal-client.ts`**
- Replaced `axios` dependency (was being imported but never installed — appeared after a git rebase
  introduced a different version of this file). Rewrote to use native `fetch` (available in Node.js 18+).
- Hardcoded model name `law-il-e2b` → `process.env['OLLAMA_MODEL'] ?? 'llama3.2'`.
  `law-il-e2b` doesn't exist in the Ollama model registry; `llama3.2` is the default general-purpose
  model available via `ollama pull llama3.2`.

**`packages/api/src/errors/api-error.ts`**
- Added `Object.setPrototypeOf(this, new.target.prototype)` in `ApiError` constructor.
  Required for `instanceof` checks to work correctly across ESM module boundaries — without it,
  `instanceof NotFoundError` could fail even on a `NotFoundError` instance when classes are loaded
  from different module instances (common in monorepos with symlinked packages).
- Added optional `details?: unknown` field, exposed in the error response JSON for validation
  failures (carries the Zod issues array).

**`packages/api/tsconfig.json`**
- Added `"exclude": ["src/**/*.test.ts"]` to prevent `better-sqlite3` type resolution errors
  during production builds. Test files import `supertest` and test utilities that pull in
  `better-sqlite3`'s raw types, causing the `Statement` generic parameter to be inferred as
  `Statement<[unknown[] | {}]>` instead of `Statement<unknown[]>`, which breaks `.run()` call sites.

**`packages/database/src/connection.ts`**
- `prepare()` return type changed from `ReturnType<BetterSQLite3Database['prepare']>` to
  `Statement<unknown[]>` with an explicit cast. The `ReturnType<>` form resolves the generic
  parameter as `unknown[] | {}` (union), which collapses to a conditional type requiring exactly
  one argument that is itself `unknown[] | {}`. Every `.run()` / `.all()` / `.get()` call site
  downstream then fails. The explicit cast is safe because all callers pass `unknown[]` arguments.

**`packages/database/src/hardening.ts`**
- `(this.db.raw as { filename: string }).filename` → `this.db.raw.name`.
  `.filename` is not a property on `BetterSQLite3.Database`; `.name` is the correct property
  that holds the database file path.

**`packages/database/src/queries/cases.ts`** / **`clients.ts`**
- Added `hasNextPage: total > page * pageSize` to all `PaginatedResult<T>` returns.
  The `PaginatedResult` shared type requires this field; it was absent, causing a type error.

**`packages/shared/src/metrics/index.ts`**
- `documentId` and `tags` optional fields switched to spread pattern for the same
  `exactOptionalPropertyTypes` reason as DashboardPage above.

**`apps/desktop/MainWindow.xaml.cs`**
- DB path corrected: was using `Environment.GetFolderPath(SpecialFolder.CommonApplicationData)`
  which resolves to `C:\ProgramData\` (not writable without admin in typical installs).
  Changed to the branded office root literal `C:\אלטמן משרד עורכי דין - סדר 2026\_Data\factum-il.db`
  matching `powershell/lib/Config.ps1` and the Node.js `start.ts` default.

**`apps/dashboard/src/api/hooks.ts`** (Phase 5 retroactive fix)
- API hooks were returning the raw envelope `{ success, data }` object to React Query callers
  instead of unwrapping `.data`. Every UI component then received an object instead of its data,
  causing all panels to show loading/error states indefinitely.
- Added `fetchJSON<T>`, `postJSON<T>`, `patchJSON<T>` helpers that unwrap the envelope and throw
  `ApiClientError` (exported from `client.ts`) on `success: false`.

**`apps/dashboard/src/api/client.ts`** (Phase 5 retroactive fix)
- `class ApiClientError` → `export class ApiClientError` so hooks can import and `instanceof`-check it.

**`packages/api/src/start.ts`** (Phase 5 retroactive fix)
- Added `mkdirSync(dirname(DB_PATH), { recursive: true })` before opening the database.
  On a fresh install the `_Data` directory doesn't exist yet; `better-sqlite3` throws
  `"Cannot open database — directory does not exist"` without this guard.

**`migrations/002_fts5_indexes.sql`** (Phase 5 retroactive fix)
- Removed `tokenchars ".-_"` from the FTS5 `tokenize` directive.
  `tokenchars` was introduced in SQLite 3.46; the version bundled with
  `better-sqlite3@9.6.0` is 3.45.3, which throws `"parse error in tokenize directive"` at
  migration runtime. Removing it degrades only minor tokenisation edge-cases (hyphenated words
  are split at the hyphen), not core Hebrew search behaviour.

### Added
- `apps/dashboard/package.json` — `@remix-run/router ^1.23.2` as devDependency (required for
  the stable `Router` type annotation in `router/index.tsx`; the package is already in the pnpm
  lockfile as a transitive dependency of `react-router-dom`).

---

## [Phase 6] — 2026-05-10

### Added

**Desktop Shell — `apps/desktop` (C# WPF + WebView2)**
- `apps/desktop/FactumIL.Desktop.csproj` — WPF project targeting .NET 8 / win-x64; `PublishSingleFile` in Release; NuGet `Microsoft.Web.WebView2`
- `apps/desktop/app.manifest` — `requireAdministrator`, PerMonitorV2 DPI awareness, Windows 10/11 compatibility GUID
- `apps/desktop/App.xaml` + `App.xaml.cs` — minimal WPF application entry point
- `apps/desktop/MainWindow.xaml` — branded splash screen (navy/gold, Hebrew subtitle) + `wv2:WebView2` control hidden until API is ready
- `apps/desktop/MainWindow.xaml.cs` — boot sequence: start Node.js API child process → poll `GET /api/clients` until HTTP 200 (max 30 s) → `EnsureCoreWebView2Async` → navigate to `http://localhost:3001`; DevTools enabled only when `Debugger.IsAttached`; `Kill(entireProcessTree: true)` on window close; `NODE_ENV=production` + `FACTUM_IL_DB_PATH` injected into child environment
- `apps/desktop/publish.ps1` — 4-step release pipeline: `pnpm build` API → `pnpm build` dashboard → `dotnet publish --runtime win-x64` → copy assets to `dist/win-x64/`

**Installer — `apps/installer/START-HERE.ps1` (rewrite)**
- Auto-elevation: re-launches itself with `-Verb RunAs` when not Administrator
- winget installs: Node.js LTS, Git, Tesseract, Ghostscript, Ollama, .NET 8 Runtime
- pnpm 9.4.0 installed via npm when absent
- `Install-HebrewData` — downloads `heb.traineddata` from tessdata_best if missing
- `Initialize-OllamaModels` — starts `ollama serve`, pulls `llama3.2` + `qwen2.5:7b`
- `Initialize-OfficeStructure` — delegates to `01-CreateFolderStructure.ps1` (Hebrew ACL)
- `Build-Project` — `pnpm install` → `pnpm build` → `publish.ps1`
- `New-DesktopShortcut` — creates `Factum IL.lnk` on Windows Desktop pointing to the published `.exe`
- `Invoke-SmokeTests` — node / pnpm / tesseract / gswin64c / ollama version checks
- Three modes: `Install` (default), `Repair`, `Upgrade`; interactive launch prompt at end of Install

---

## [Phase 5] — 2026-05-10

### Added

**HTTP API Server — `packages/api`**
- `packages/api/src/start.ts` — Entry point: opens SQLite (WAL+FK), runs migrations, boots Express on `:3001`; production mode serves built Vite bundle + React Router SPA fallback (required for WebView2 single-process packaging)
- `packages/api/src/app.ts` — Express factory function mounting all routers; CORS, JSON body parsing, request logger, centralised error handler
- `packages/api/src/db.ts` — `Repos` bag type injecting all repositories into route handlers
- `packages/api/src/errors/codes.ts` + `api-error.ts` — `ApiError` hierarchy: `NotFoundError` (404), `ValidationError` (422), `ConflictError` (409), `IntegrityError` (500)
- `packages/api/src/utils/async-handler.ts` — `Promise.resolve(fn).catch(next)` wrapper eliminating try/catch boilerplate in routes
- `packages/api/src/utils/pagination.ts` — `parsePagination` helper (page/pageSize, clamped 1–200)
- `packages/api/src/utils/response.ts` — `ok(res, data, status)` / `fail(res, code, msg, status)` typed response helpers
- `packages/api/src/middleware/error.ts` — Centralised error-to-JSON handler; `ApiError` subclasses map to their HTTP codes; unknown errors → 500
- `packages/api/src/middleware/request-logger.ts` — `METHOD originalUrl → statusCode (ms)` logging
- `packages/api/src/middleware/validate.ts` — Zod schema middleware factory; validates `body` or `query`, throws `ValidationError` on failure; `.strict()` rejects unknown fields
- `packages/api/src/validation/` — Zod schemas for clients, cases, action-plan, queue, common pagination
- 27 REST endpoints across 7 routers: `/api/clients`, `/api/cases`, `/api/documents`, `/api/search`, `/api/queue`, `/api/action-plan`, `/api/admin`

**Unified API Contract**
- All responses: `{ success: true, data: T }` or `{ success: false, error: { code, message } }`
- Error codes: `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTEGRITY_ERROR`, `INTERNAL_ERROR`

**Dashboard Updates**
- `apps/dashboard/src/api/client.ts` — Centralised typed API client with namespaced methods (`api.clients.*`, `api.cases.*`, etc.) replacing ad-hoc fetch calls in hooks
- `apps/dashboard/vite.config.ts` — Added `/api` proxy to `http://localhost:3001` for dev mode

**Root Workspace**
- `package.json` — Added `concurrently ^8.2.2`; `dev` script now starts API + Vite simultaneously (`concurrently -n api,ui`)

**Tests**
- `packages/api/src/app.test.ts` — 14 integration tests via `supertest`: empty list, create client (201), 404 not-found, 422 validation, strict-mode unknown fields, PATCH update, create case, action plan approve/sign, FTS5 search, queue stats

### Fixed
- Request logger now uses `req.originalUrl` (full path) instead of `req.path` (sub-router path)

---

## [Phase 4] — 2026-05-10

### Added

**PowerShell — Office Configuration & Folder Bootstrap**
- `powershell/lib/Config.ps1` — Branded root path (`C:\אלטמן משרד עורכי דין - סדר 2026\`), sub-folder map, WatchFolders (`Downloads`, `Documents`), `Get-WatchFolderLabel` helper
- `powershell/scripts/01-CreateFolderStructure.ps1` — Idempotent bootstrap; creates root + sub-folders, grants ACL for Hebrew path, prints Hebrew success message
- `powershell/FactumIL.psm1` — Now dot-sources `Config.ps1` before all sub-modules
- `apps/installer/START-HERE.ps1` — Added `Initialize-OfficeStructure` which runs the folder bootstrap before database init; displays branded Hebrew success message

**Database — Migration & Repository Layer**
- `migrations/008_action_plan.sql` — `ActionPlan` table with `source_folder` attribution, `suggested_path` (always under branded root), status lifecycle, `ai_enriched` flag, confidence score, signed/executed timestamps
- `packages/database/src/queries/cases.ts` — New `CaseRepository`: `create`, `findById`, `findByCaseNumber`, `findByClientId` (with optional status filter), `update`, `list` (paginated), `getTimeline` (JOINs ProcessingStatus + Documents), `close`
- `packages/database/src/queries/action-plan.ts` — New `ActionPlanRepository`: `createEntry`, `findById`, `list` (with optional status filter), `approve` (bulk, sets `signed_at`), `reject` (bulk), `getSignedPlan` (returns `SignedActionPlan`), `markExecuted`
- `packages/database/src/queries/clients.ts` — Added `create`, `update`, `list`, `deactivate` methods; FTS sync wrapped in non-fatal try/catch
- `packages/database/src/index.ts` — Exports `CaseRepository`, `ActionPlanRepository`, `CreateActionPlanInput`

**Shared Types**
- `packages/shared/src/types/entities.ts` — Added `ClientCreateInput`, `CaseCreateInput`, `ActionPlanStatus`, `ActionPlanEntry`, `SignedActionPlan`, `TimelineEvent`

**Dashboard — API Hooks**
- `apps/dashboard/src/api/hooks.ts` — Added 12 new hooks: `useClients`, `useClient`, `useClientTimeline`, `useCreateClient`, `useUpdateClient`, `useCases`, `useCase`, `useCreateCase`, `useActionPlan`, `useApproveActionPlan`, `useRejectActionPlan`, `useSignActionPlan`
- `apps/dashboard/package.json` — Added `@tanstack/react-virtual@^3.8.1`

**Dashboard — React Components**
- `features/clients/ClientForm.tsx` — RTL slide-over form with real-time Israeli Luhn ID validation (colour feedback), all client fields
- `features/clients/ClientCard.tsx` — `/clients/:id` detail view; tabbed (Cases / Documents / Timeline), avatar, editable header
- `features/clients/ClientTimeline.tsx` — Vertical chronological timeline from ProcessingStatus transitions
- `features/clients/ClientsPage.tsx` — Replaces stub; paginated list, search, avatar initials, empty state
- `features/cases/CaseForm.tsx` — RTL slide-over; case type/status selects, court/date fields, inline client search
- `features/cases/CasesPage.tsx` — Replaces stub; paginated, searchable, status badges, case type labels
- `features/action-plan/ActionPlanPage.tsx` — TanStack Virtual virtualised table (100k+ rows), source attribution badges (הורדות / מסמכים / ידני), AI `CircuitBoardIcon` badge, confidence bar, bulk approve/reject, sign button (disabled until ≥1 APPROVED), Hebrew toast notifications
- `components/common/SpotlightSearch.tsx` — Wired to `useSearch`; grouped results (Clients/Cases/Documents), entity filter pills, OCR snippet preview, keyboard navigation (↑↓ Enter Esc)
- `features/documents/DashboardPage.tsx` — Branded office header ("אלטמן משרד עורכי דין — סדר 2026"), live stats from API hooks
- `router/index.tsx` — Added `/clients/:id` → `ClientCard`, `/action-plan` → `ActionPlanPage`
- `components/layout/Sidebar.tsx` — Added "תוכנית פעולה" nav item with `ClipboardTextIcon`

**Tests**
- `tests/unit/luhn.test.ts` — Extended Israeli Luhn validation suite (10 cases)
- `tests/unit/client-repository.test.ts` — In-memory DB: create, findById, update, list pagination, deactivate
- `tests/unit/case-repository.test.ts` — FK-linked client/case, findByClientId with status filter, getTimeline
- `tests/unit/action-plan-repository.test.ts` — createEntry, approve, reject, getSignedPlan, markExecuted, source attribution
- `tests/integration/client-case-flow.test.ts` — End-to-end: create client → case → document → timeline → action plan sign

**Docs**
- `docs/client-management.md` — Client Card, Luhn algorithm, timeline events, API endpoints
- `docs/action-plan.md` — Action Plan table, source attribution, sign workflow, safety guarantees
- `docs/office-config.md` — Branded root path, sub-folders, WatchFolders, ACL, DB location

---

## [Phase 3] — 2026-05-09

- Hebrew FTS5 search engine with prefix normalization and synonym expansion
- Admin diagnostics dashboard (WorkerHealth, WatcherEvents, BackupSnapshots, RepairTools)
- Supervisor, FileWatcher, CrashRecovery PowerShell modules
- Migrations 005–007 (queue locks, search AI hardening, supervisor watcher tables)

## [Phase 2] — 2026-05-08

- Persistent queue with WAL-mode SQLite, poison queue, crash recovery
- OCR pipeline worker with state machine (DISCOVERED → VERIFIED)
- Migrations 003–004 (ActionLog, ProcessingStatus, AIEnrichment)

## [Phase 1] — 2026-05-07

- Initial monorepo scaffold (pnpm workspaces)
- Core schema: Clients, Lawyers, Judges, Cases, Documents (Migration 001)
- FTS5 virtual tables (Migration 002)
- React dashboard skeleton with RTL layout, design tokens (Navy/Parchment/Gold)
