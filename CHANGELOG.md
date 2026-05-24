# Changelog

All notable changes to Factum IL are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
