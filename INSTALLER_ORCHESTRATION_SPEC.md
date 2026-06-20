# Factum-IL — Installer & Startup Orchestration Specification

> Target architecture for deployment + runtime lifecycle on a clean Windows
> machine. Companion to `INSTALLER_FAILURE_ANALYSIS.md`. Implemented on branch
> `claude/factum-il-installer-analysis-c85kcf`.

Architecture is **C# WPF + WebView2** (Windows-only). There is **no Electron**.
The Node API (`packages/api`, Express, port 3001) is a child process; Ollama is a
child process; the dashboard (React) is served by the API and hosted in WebView2.

---

## 0. Status & scope (implemented vs deferred)

Per the architecture review (`IMPLEMENTATION_REVIEW.md`) the **minimal mandatory
set** is implemented; some sections below describe **deferred** future work.

**Implemented:** lightweight installer · `OllamaService` timeouts ·
`register-ollama-model.ps1` bounded timeout · `RetryPolicy` · `OllamaLifecycle`
(single source of truth, §2a) · resumable **`BootstrapManager`** (atomic state,
numeric step IDs, mutex, early Safe Mode, per-step telemetry) · `StartupLogger`
(`bootstrap.jsonl` + `bootstrap-summary.json`) · `SafeModeManager` ·
non-fatal API wait → `RecoveryWindow` · fast `GET /api/health/functional`.

**Deferred (documented but not in the codebase):** `OllamaSupervisor` (runtime
monitoring + auto-exit of Safe Mode) · `RepairManager` · `health-summary.json`
analytics · `GET /api/health/full` deep tier · `BootstrapHarness` +
`installer-pipeline.yml` + `powershell/ci/*`. These appear in §6, §7 (deep tier),
§11–§12 and are collected under **"Deferred / future"** at the end.

---

## 1. Installation flow (installer.iss)

The installer is intentionally **thin** — files, prerequisites, configuration,
launch. No heavy initialization.

```
InitializeSetup
  ├─ require .NET 8 Desktop Runtime        (abort + link if missing)
  └─ downgrade guard                       (FACTUM_IL_VERSION registry)
Wizard
  └─ choose legal-documents directory
[InstallDelete]  purge stale node_modules / dist (clean upgrade)
[Files]          shell, node.exe, api, dashboard, migrations, corpus, tools, GGUF
[Registry]       FACTUM_IL_ROOT, OLLAMA_MODEL, OLLAMA_BASE_URL, AI_TIER,
                 SQLITE_VEC_PATH, WHISPER_EXE, FFMPEG_EXE, FACTUM_IL_VERSION
[Run]
  1. WebView2 silent install   (Check: NeedsWebView2,  waituntilterminated)
  2. Ollama   silent install   (Check: NeedsOllama,    waituntilterminated)
  3. Launch FactumIL.Desktop   (nowait postinstall)
```

**Removed (was the root cause):** the previous Steps 3 (60 s Ollama-wait loop) and
4 (`ollama create` model registration, unbounded `waituntilterminated`). Model
registration is now first-launch work. The installer therefore completes promptly
and identically under interactive and `/VERYSILENT` installs.

**Installer responsibilities (only):** install files · install prerequisites ·
register configuration · launch app.

---

## 2. Dependency graph (Enhancement 9)

```
WebView2 ──► Desktop Shell (WPF) ──► API (Express) ──► Database (SQLite)
                                  │                       │
                                  │                       ├─► Vector index (sqlite-vec)
                                  │                       └─► Corpus (LegalSources)
                                  └─► Ollama Runtime ──► Registered Model ──► Embeddings ──► RAG / AI features
```

| Node | Startup requirement | Health requirement | Recovery behavior | Failure impact |
|---|---|---|---|---|
| WebView2 | Installed (Evergreen) | Registry `pv` ≠ empty/0.0.0.0 | Installer step 1; `MainWindow` prompts to run bundled bootstrapper | No UI → app unusable (guided fix) |
| Desktop Shell | .NET 8 Desktop Runtime | Process running | Re-launch | App won't start |
| API | `node.exe` + `FACTUM_IL_ROOT` | `GET /api/health` 200 | `App` waits (90 s budget) → `RecoveryWindow`; safe-mode restart | **Fatal** — no app |
| Database | DB path writable | `checks.db.healthy` + functional `SELECT` | Migrations idempotent; post-update rollback | **Fatal** — no app |
| Vector index | sqlite-vec DLL | `vec_chunks` queryable | `POST /api/admin/repair/rag`; JS cosine fallback | Degraded retrieval |
| Corpus | Bundled JSONL present | `LegalSources` rows > 0 | Re-run loader on next boot | Degraded knowledge |
| Ollama Runtime | Ollama installed | Verified ping to `/api/tags` | `OllamaService.StartAsync` + retry; supervisor | AI disabled (safe mode) |
| Registered Model | Bundled GGUF or network | Model in `/api/tags` + inference probe | `EnsureModelAsync` retry; supervisor re-register | AI disabled (safe mode) |
| Embeddings | Ollama + `nomic-embed-text` | Sample embedding returns vector | Retry; JS fallback | Degraded RAG |
| RAG / AI | All of the above | `/api/health/functional` ok | Supervisor + repair | AI features off |

No node starts before its dependency is **verified healthy** (not merely started).

---

## 2a. Ollama lifecycle state machine (R1 — single source of truth)

`OllamaLifecycle` is the **authoritative** runtime/model state; `BootstrapManager`
and `SafeModeManager` read it (no independent flags). `Ready` is set only after a
verified ping. Illegal transitions are logged (`illegal-transition`) and ignored.

```
Runtime:
  NotInstalled ──► Installing ──► Installed ──► Starting ──► Ready
       │                              │            │           │
       └──────────────► (any) ────────┴────────────┴──► Failed ─┘ (Failed ─► Starting/Ready/Installed)

Model:
  NotFound ──► Registering ──► Ready
      │            │            │
      └─► (any) ───┴──► Failed ─┘   (Failed ─► Registering/Ready)
```

Legal transitions (others rejected): every state → `Failed`; `Failed` may recover
to `Starting`/`Ready`/`Installed` (runtime) or `Registering`/`Ready` (model);
same-state writes are no-ops. The model reaching `Ready` requires a confirmed
presence check after `ollama create`/`pull`.

---

## 3. Startup graph (first launch & every launch)

```
App.OnStartup
 ├─ install crash handlers, StartupLogger
 ├─ ApiHostService.Start()            (spawn Node, hidden)
 ├─ OllamaService (lifecycle tracker; warn if not installed)
 ├─ SplashWindow.Show()
 └─ RunBootSequenceAsync
      ├─ Ollama.StartAsync()                            (non-blocking)
      ├─ ReadPortAsync() ; WaitForApiAsync (90 s)       (API = only hard gate)
      │     └─ timeout → RecoveryWindow (NOT Shutdown)
      ├─ BootstrapManager.RunAsync()  ◄── resumable; see §5
      │     deps → webview2 → ollama-runtime → ollama-model
      │          → database → vector-index → corpus
      ├─ StartupValidator.ValidateAsync()  (diagnostic snapshot)
      ├─ Fatal | unhealthy → RecoveryWindow (+ Repair)
      ├─ Degraded & AI not ready → SafeModeManager.Enter()
      ├─ MainWindow.Show()
      └─ OllamaSupervisor.Start()   ◄── runtime monitoring; see §6
```

---

## 4. Retry & timeout strategy

`RetryPolicy.RunAsync` (C#) is the single primitive: exponential backoff,
`MaxAttempts`, optional `OverallTimeout`, `CancellationToken`, structured log +
progress. **No infinite loops; no unbounded waits.**

| Operation | Attempts | Per-attempt / overall budget | On exhaustion |
|---|---|---|---|
| API readiness (`WaitForApiAsync`) | poll 500 ms | 90 s (`FACTUM_IL_API_TIMEOUT_SEC`) | `RecoveryWindow` |
| Ollama runtime ready | 6 | 5 s backoff / 30 s overall | step = `RecoverableOffline` |
| Model register (`EnsureModelAsync`) | 3 | create 30 m / pull 60 m (env) | model = `Failed`, degrade |
| Supervisor recovery | 3 | 15 s backoff / 2 m overall | safe mode + escalate |
| `register-ollama-model.ps1` (manual) | 1+`MaxRetries` | `TimeoutSec` (1800) via `Wait-Job` | non-fatal exit 0 |

Timeout env overrides: `FACTUM_IL_API_TIMEOUT_SEC`,
`FACTUM_IL_OLLAMA_READY_TIMEOUT_SEC`, `FACTUM_IL_OLLAMA_CREATE_TIMEOUT_MIN`,
`FACTUM_IL_OLLAMA_PULL_TIMEOUT_MIN`, `FACTUM_IL_SUPERVISOR_INTERVAL_SEC`.

---

## 5. First-launch bootstrap & recovery (BootstrapManager)

- State persisted to `%LOCALAPPDATA%\FactumIL\bootstrap-state.json`:
  `{ bootstrapVersion, completedSteps{stepId→utc}, lastError, attemptCount }`.
- **Resumable:** completed steps are skipped on the next launch; a crash at step
  *N* resumes at *N* (not from scratch).
- **Versioned (Enhancement 6):** `bootstrapVersion` (const `CurrentVersion`). When
  a new app version adds steps, completed steps stay complete and only new steps
  run — no full re-bootstrap on upgrade.
- **Outcome classification (Enhancement 8 — offline-first):**
  - `Ok` → recorded complete.
  - `RecoverableOffline` → recorded as warning, **not** completed (retried next
    launch); app proceeds degraded (e.g. no internet + bundled GGUF missing,
    corpus absent, Ollama not installed).
  - `Fatal` → app cannot run (missing `FACTUM_IL_ROOT`/`node.exe`, unhealthy DB);
    routed to `RecoveryWindow`.
- **Diagnostics (Enhancement 4):** writes `bootstrap-summary.json`
  `{ bootstrapVersion, lastSuccessUtc, lastFailureUtc, failedStep, attemptCount,
  durationSeconds, recoveryActions[] }` and appends to `health-summary.json`.

**Repair (Enhancement 5) — `RepairManager`:** detects WebView2 / Ollama / model /
database / vector / corpus / config, repairs what it can (restart Ollama,
re-register model, `POST /api/admin/repair/rag`) and reports the rest. Exposed via
the **Repair** button in `RecoveryWindow` and the dashboard's existing
`/api/admin/repair/*` endpoints (Settings → Diagnostics).

---

## 6. Runtime supervision & safe mode

- **`SafeModeManager` (implemented):** keeps the app usable without AI — case &
  document management, DB access, local search, UI navigation stay ENABLED; RAG,
  AI chat, embeddings, inference are DISABLED. The Node API already disables
  AI-backed workers under `FACTUM_IL_SAFE_MODE=1`; the dashboard degrades on
  `/api/health` `ai_ready=false`. `BootstrapManager` enters Safe Mode on the first
  recoverable AI-infra failure (R8). **Failure degrades, never shuts down.**
- **`OllamaSupervisor` (DEFERRED):** a background loop for mid-session
  process/API/model monitoring + bounded recovery + automatic Safe Mode *exit*.
  Not implemented in the minimal set — until then, AI features re-enable on the
  live `/api/health ai_ready` and the C# Safe-Mode banner clears on next launch.

---

## 7. Functional ("operational") health (Enhancement 3)

- `GET /api/health` — liveness (db/migrations/ollama/queue/disk/rag).
- `GET /api/health/functional` — **fast** operational tier: DB query, `vec_chunks`
  retrieval, `LegalSources` sample. `ok = db && vector && corpus`. No embedding/AI
  calls (cheap enough to poll). Consumed by `BootstrapManager` (steps 60/70) and
  `FunctionalHealthChecks.cs`.
- `GET /api/health/full` — **DEFERRED** deep tier (embedding generation, vector
  retrieval, sample RAG, inference probe). Not implemented in the minimal set.

---

## 8. Observability (Enhancement 9 & 10)

Structured NDJSON at `%LOCALAPPDATA%\FactumIL\logs\bootstrap.jsonl`:
`{ timestamp, component, event, status, durationMs, error, … }` via `StartupLogger`.
Aggregates: `bootstrap-summary.json` (last outcome), `health-summary.json` (rolling
field-failure analytics: category, component, retry count, recovery outcome,
time-to-recovery). Performance budgets (Enhancement 7) in `StartupBudgets`: app
launch < 10 s, API ready < 15 s, Ollama ready < 30 s, bootstrap resume < 5 s,
recovery detection < 10 s — actual timings logged, budget breaches logged as warn.

---

## 9. User-experience flow

1. Double-click installer → fast install (no multi-minute AI step) → optional launch.
2. First launch → splash shows API → Ollama → model registration progress.
3. AI unavailable → app opens in safe mode with a clear tray notification; AI
   restores automatically (supervisor) with a "AI available again" notification.
4. Fatal issue → `RecoveryWindow` with the precise reason, **Repair**, export
   support bundle, open logs, or continue in safe mode — never a silent crash.

---

## 10. Offline behavior

| Condition | Behavior |
|---|---|
| No internet, bundled GGUF present | Model registered locally on first launch (`RecoverableOffline`→`Ok`). |
| No internet, no GGUF | `RunOllamaModel` = `RecoverableOffline`; safe mode; retried next launch. |
| Slow internet | Pull bounded by `…_PULL_TIMEOUT_MIN`; no infinite wait. |
| Partial / interrupted download (pull) | Retried (`RetryPolicy`), then degrade; resume next launch. |
| Corpus absent (`skipifsourcedoesntexist`) | App runs without corpus; functional corpus check warns; retried. |

---

## 11. Failure-mode test matrix (Phase 10)

Most of these are now **automated** by the staged CI/CD pipeline
`.github/workflows/installer-pipeline.yml` (Stage 4 `failure-matrix-tests`), which
runs the headless bootstrap harness (`FactumIL.Desktop.exe --bootstrap-check`)
against a real Windows install + real Ollama/model. See §12. The table below is the
behavioral contract each scenario asserts:

| # | Injected failure | How to simulate | Expected result |
|---|---|---|---|
| 1 | Ollama unavailable | Uninstall/stop Ollama | Warn at startup; safe mode; app fully usable for non-AI; supervisor retries. |
| 2 | Slow startup | Throttle disk / set `FACTUM_IL_API_TIMEOUT_SEC=5` low | Bounded wait → `RecoveryWindow` (no `Shutdown`). |
| 3 | Missing model | Delete model from Ollama store | First launch re-registers from GGUF; if offline+no GGUF → safe mode, retried. |
| 4 | Corrupted model | Truncate GGUF | `create` fails → retried → `Failed` → safe mode; inference probe catches it. |
| 5 | Missing corpus | Remove `app/legal-corpus` | `corpus` step `RecoverableOffline`; app runs; functional corpus warns. |
| 6 | Locked database | Hold a write lock | WAL + 30 s busy timeout; if still failing → `db` Fatal → `RecoveryWindow`. |
| 7 | Missing WebView2 | Remove registry key | `MainWindow` prompts to run bundled bootstrapper; `webview2` step warns. |
| 8 | Network unavailable | Disable NIC | Offline matrix §10; no infinite waits. |
| 9 | Interrupted installation | Kill installer mid-run | `[InstallDelete]` + clean re-install; downgrade guard intact. |
| 10 | Interrupted bootstrap | Kill app during model step | Next launch reads `bootstrap-state.json` and **resumes at the model step**. |

Record outcomes against `bootstrap.jsonl` / `bootstrap-summary.json` /
`health-summary.json`.

---

## 12. Staged CI/CD pipeline (`installer-pipeline.yml`) — DEFERRED

> **Deferred / future.** The staged pipeline, the `--bootstrap-check`
> `BootstrapHarness`, and `powershell/ci/*` are **not** in the codebase (they would
> be test-only infrastructure). The design is retained here for when CI validation
> of the Windows install→bootstrap→failure paths is prioritized. Until then, the
> `build-installer.yml` smoke test (silent install + `/api/health`) is the gate.

A `workflow_dispatch`/path-triggered pipeline validates the real Windows install →
first-launch bootstrap → failure/recovery paths. Each stage consumes the immutable
installer artifact from Stage 1 and **re-installs from scratch** — no job relies on
another job's environment state. It uses a lightweight `-SkipGGUF` installer; the
full GGUF-bundled release installer remains `build-installer.yml`.

| Stage | Job | Does | Artifacts |
|---|---|---|---|
| 1 | `build-installer` | build + typecheck + test → `publish.ps1 -SkipGGUF` → ISCC → SHA256. **No install/runtime.** | `installer-package` (exe + `checksum.txt`), `build-logs` |
| 2 | `installer-validation` | verify SHA → `/VERYSILENT` install → `Validate-Install.ps1` (files/registry/WebView2/Ollama) → start API once in safe mode. **No bootstrap.** | `install-state` (`system-state.json`, `install-log.txt`) |
| 3 | `bootstrap-validation` | re-install → cache + `Register-CIModel.ps1` (real model from GGUF asset) → `Invoke-BootstrapValidation.ps1` (sequential completion + resume test) | `bootstrap-state` (`bootstrap.jsonl`, `bootstrap-summary.json`, `functional-test-results.json`) |
| 4 | `failure-matrix-tests` | re-install → matrix of 7 scenarios via `Invoke-FailureScenario.ps1` (bounded timeout, asserts safe-mode/recovery + diagnostics) | `failure-<scenario>` (`failure-report.json`, traces) |

Enablers: the **headless harness** (`BootstrapHarness.cs`, `--bootstrap-check
[--api-port N] [--expect success\|degraded\|fatal]`, exit 0/2/1/3) runs bootstrap
without the WPF GUI; the **`FACTUM_IL_MIN_DISK_MB`** env knob makes the disk-low
scenario deterministic. CI glue lives in `powershell/ci/`.
