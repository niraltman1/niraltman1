# Factum-IL — Installer Remediation: Implementation Review

> Pre-merge architecture review of PR #130, validated against the codebase, with the
> final scope decision (minimal mandatory set + hardening; defer the rest).

## 1. Existing functionality discovered (reused, not rebuilt)
- **Startup orchestration** already existed in `FactumIL.Desktop/App.xaml.cs`
  (spawn API + Ollama → poll `/api/health` → wait Ollama → ensure model → validate
  → `RecoveryWindow`). We refactored it to **delegate** to `BootstrapManager`.
- **Health endpoint** `packages/api/src/routes/health.ts` (`/api/health`: db,
  migrations, ollama, queue, disk, rag) — reused; added a fast `/functional` tier.
- **Retry/timeout precedent**: `publish.ps1 DownloadWithRetry`, `OllamaService`
  polling, `ModelCircuitBreaker` (`packages/model-router`). `RetryPolicy.cs` unifies
  the C# side.
- **Recovery + safe mode** primitives: `RecoveryWindow`, `StartupValidator`,
  `FACTUM_IL_SAFE_MODE` API restart, `DiagnosticsService` — reused.
- **RAG repair** endpoint `POST /api/admin/repair/rag` — reused (no new repair system).
- **Logging**: TS `obsLogger` (`packages/observability`); C# had only ad-hoc file
  writes → `StartupLogger.cs` adds the missing C# structured logger.

## 2. Overlap analysis & resolution
| Risk of duplication | Resolution |
|---|---|
| Second orchestrator (App vs BootstrapManager) | App **delegates**; BootstrapManager is the sole first-launch orchestrator. |
| Duplicate state tracking | `OllamaLifecycle` is the single source of truth (R1); legal-transition table. |
| Duplicate repair system | **RepairManager removed**; recovery via `RecoveryWindow` + `/api/admin/repair/rag`. |
| Duplicate health system | `/functional` extends `/api/health`; no parallel system. |
| Test-only infra in prod | `BootstrapHarness` + `installer-pipeline.yml` + `powershell/ci/*` **removed (deferred)**. |

## 3–7. Component dispositions
| Component | Disposition |
|---|---|
| installer.iss fix, OllamaService timeouts, `register-ollama-model.ps1` timeout | **Mandatory — kept.** |
| `RetryPolicy` | **Mandatory — kept** (+`onAttempt` for telemetry). |
| `BootstrapManager` | **Mandatory — kept + hardened** (R2 atomic state, R3 numeric IDs, R7 mutex, R8 early safe mode, R9 telemetry). |
| `OllamaLifecycle` | **Kept** as single source of truth (R1, transition table). |
| `App.WaitForApiAsync` → RecoveryWindow | **Mandatory — kept.** |
| `StartupLogger` | **Kept**, minimal (structured `bootstrap.jsonl` + `bootstrap-summary.json` with per-step telemetry). |
| `SafeModeManager` | **Kept**, thin coordinator. |
| `FunctionalHealthChecks` + `/api/health/functional` | **Kept**; `/functional` made **fast** (R4 minimal; embedding probe removed). |
| `OllamaSupervisor` | **Removed (deferred).** |
| `RepairManager` | **Removed (deferred).** |
| `health-summary.json` / `FailureRecord` | **Removed (deferred).** |
| `/api/health/full` deep tier | **Deferred.** |
| `BootstrapHarness`, `installer-pipeline.yml`, `powershell/ci/*`, `FACTUM_IL_MIN_DISK_MB` | **Removed (deferred — test-only infra).** |

## 8. Estimated complexity
Low–moderate. Mandatory set is concentrated in `BootstrapManager` (state machine +
persistence) and small edits across `OllamaLifecycle`/`OllamaService`/`App`/`health.ts`.
No new packages; no new long-running services.

## 9. Operational risks (and mitigations)
- **WPF compiles only on Windows** → validated on Windows CI, not Linux/this env.
- **Safe-mode auto-exit deferred with Supervisor** → after recovery the dashboard
  still re-enables AI on the live `/api/health ai_ready`; the C# `SafeModeManager`
  banner clears on next launch. Acceptable for minimal scope; revisit if needed.
- **Mutex `Global\` name** may be restricted in locked-down environments → falls
  back to `Local\` on failure.
- **Atomic rename** relies on `File.Move(overwrite)` (.NET 8) — same volume (it is).

## 10. Recommended final architecture (adopted)
Lightweight installer (files + prerequisites + config + launch) → `App` delegates to
a single, mutex-guarded, resumable `BootstrapManager` with atomic state keyed by
stable numeric step IDs → `OllamaLifecycle` as the runtime/model source of truth →
early Safe Mode on recoverable AI failure → `RecoveryWindow` for fatal only →
structured telemetry in `bootstrap.jsonl` / `bootstrap-summary.json`.

## Final approved code changes (on `claude/factum-il-installer-analysis-c85kcf`)
installer.iss (no model registration) · `OllamaService` timeouts + lifecycle ·
`register-ollama-model.ps1` bounded timeout · `RetryPolicy` (+onAttempt) ·
`OllamaLifecycle` (transition table) · `BootstrapManager` (R2/R3/R7/R8/R9) ·
`StartupLogger` (telemetry summary) · `SafeModeManager` · `FunctionalHealthChecks` ·
`App.xaml.cs` (delegate + non-fatal API) · `health.ts` fast `/functional` + test.

## Rejected / deferred enhancements
`OllamaSupervisor` · `RepairManager` · `health-summary.json` · `/api/health/full` ·
`BootstrapHarness` · `installer-pipeline.yml` + `powershell/ci/*` ·
`FACTUM_IL_MIN_DISK_MB`. (Documented in `INSTALLER_ORCHESTRATION_SPEC.md` →
"Deferred / future".)

## Merge recommendation
**Ready with follow-up.** The minimal mandatory set resolves all five core issues
(installer block, model-registration timeout, resumable bootstrap, fatal API
timeout, recovery-path weaknesses) and is internally consistent. Deferred items are
explicitly out of scope and tracked. Final gate: Windows CI compiles
`FactumIL.Desktop` and the installer smoke test passes.
