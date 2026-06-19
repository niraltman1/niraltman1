# Factum-IL — Installer & Startup Failure Analysis

> Root-cause analysis of the "installer builds in CI but fails during execution /
> post-install initialization" reports, with the remediation applied on branch
> `claude/factum-il-installer-analysis-c85kcf`.

---

## 0. Executive summary

The installer **build** is healthy. Failures occur at **install time** and during
**post-install initialization**. The investigation overturned several assumptions
in the original brief:

| Assumption in brief | Reality in this repo |
|---|---|
| "Electron startup sequence" | **No Electron.** Desktop shell is C# WPF + WebView2 (`FactumIL.Desktop/`). Startup is controlled by C# + the Inno Setup installer. |
| "No startup orchestrator / assumes services are instantly available" | A real async boot orchestrator already exists in `App.xaml.cs` (spawn API + Ollama → poll `/api/health` → wait Ollama → ensure model → validate → recovery window). |
| "No health checks / retries / timeouts" | All already present: `/api/health` (`packages/api/src/routes/health.ts`), `StartupValidator.cs`, `ModelCircuitBreaker` (`packages/model-router/src/circuit-breaker.ts`), `DownloadWithRetry` in `publish.ps1`, idempotent corpus loaders, post-update auto-rollback (`packages/update-core/src/PostUpdateHealthCheck.ts`). |

The real failure is **narrow and specific**: the installer performed **heavy AI
initialization (model registration) inline, with no timeout, while blocking
installer completion**. Secondary issues were timing-based waits, a non-resumable
first run, and a single fatal API-wait.

---

## 1. The blocking root cause (🔴 critical)

**`installer.iss` `[Run]` Step 4** ran `ollama create` (via
`scripts/register-ollama-model.ps1`) with `Flags: waituntilterminated` and **no
timeout**:

```
Filename: "powershell.exe"; Parameters: "... -File register-ollama-model.ps1 -GgufPath ...gguf";
  StatusMsg: "מאתחל מודל AI (ייתכן שייקח מספר דקות)…"; Flags: waituntilterminated
```

- `ollama create` against the bundled ~941 MB GGUF takes **10–60+ minutes** on a
  clean machine (disk I/O bound) and can hang indefinitely if Ollama is slow to
  bind its port or crashes mid-create.
- Because the step is `waituntilterminated`, **the installer cannot finish** until
  it returns. The Hebrew status ("may take a few minutes") understates this, so
  users force-kill the installer → corrupted/partial install.

**`scripts/register-ollama-model.ps1`** compounded it: `& $ollama create … --file $mf`
had **no timeout** and **no retry**, and only a 30 s wait for the Ollama service.

This single design choice — heavy, unbounded initialization inside the installer —
accounts for the reported "fails during installer execution and post-install
initialization."

**Fix:** remove model registration (and the Ollama-wait it fed) from the
installer. Model registration is now a **resumable first-launch** step in the WPF
shell (`BootstrapManager.cs` → `OllamaService.EnsureModelAsync`), retried with
bounded timeouts and reported on the splash screen.

---

## 2. Findings by category

### 2.1 Blocking operations
- 🔴 `installer.iss` `[Run]` Step 4 — `ollama create`, `waituntilterminated`, no timeout. **(fixed: removed)**
- 🟠 `installer.iss` `[Run]` Step 3 — inline PowerShell loop polling Ollama for 60 s, `waituntilterminated`; existed only to feed Step 4. **(fixed: removed)**
- 🟠 `App.xaml.cs WaitForApiAsync` — blocks boot up to 30 s and on timeout called `Application.Shutdown(1)` (fatal). **(fixed: budget now 90 s + env-configurable; on timeout routes to `RecoveryWindow` instead of exiting)**

### 2.2 Deadlock / hang risks
- 🔴 `register-ollama-model.ps1` `ollama create` with no timeout — unbounded hang. **(fixed: `Start-Job` + `Wait-Job -Timeout` + bounded retry; 124 timeout sentinel)**
- 🟠 No watchdog on the installer's PowerShell child — a stuck `ollama serve` blocked the whole install. **(fixed by removing the inline steps)**

### 2.3 Race conditions
- 🟠 Installer Step 3 used a fixed `Start-Sleep -Seconds 2` × 30 timing loop rather than a deterministic readiness gate. **(fixed: removed; readiness is now gated by verified pings in `BootstrapManager.RunOllamaRuntime` via `RetryPolicy`)**
- 🟠 First-run model registration could begin before Ollama bound its port. **(fixed: `RunOllamaRuntime` confirms reachability before `RunOllamaModel`)**

### 2.4 Missing timeout handling
- 🔴 `ollama create` (installer + script) — none. **(fixed)**
- 🟠 Ollama runtime/model timeouts hardcoded (30 s / 30 min / 60 min) in `OllamaService.cs`. **(fixed: env-overridable `FACTUM_IL_OLLAMA_READY_TIMEOUT_SEC` / `…_CREATE_TIMEOUT_MIN` / `…_PULL_TIMEOUT_MIN`)**

### 2.5 Missing retry logic
- 🟠 First-run model registration had no retry. **(fixed: `EnsureModelAsync` wraps create/pull in `RetryPolicy`, 3 attempts, exponential backoff, and re-verifies the model is present before declaring success)**
- 🟠 API wait had no structured retry/escalation. **(fixed: bounded poll + recovery escalation)**

### 2.6 Silent-install incompatibilities
- 🔴 With `/VERYSILENT`, Step 4's multi-minute block ran with no UI — appearing hung to provisioning tools and CI. **(fixed: installer is now fast and side-effect-light under silent install; CI smoke test comment added in `build-installer.yml`)**

### 2.7 Startup dependency violations
- 🟠 No single place enforced "component X only after dependency Y is verified healthy." **(fixed: `BootstrapManager` runs ordered, dependency-gated steps: deps → WebView2 → Ollama runtime → model → database → vector → corpus)**

### 2.8 Resource locking issues
- ✅ Already handled: `start.ts` removes stale `.db-journal`, releases stale agent/workflow locks; WAL + 30 s busy timeout in `connection.ts`. No regression introduced.

### 2.9 Service readiness issues
- 🟠 Readiness was inferred from "process started." **(fixed: `OllamaLifecycle` only enters `Ready` after a verified ping; new `FunctionalHealthChecks` + `/api/health/functional` prove components are *operational*, not merely responding)**

### 2.10 Network dependency failures
- ✅ `publish.ps1` already retries downloads (`DownloadWithRetry`) with SHA-256 + size validation; corpus/tools are `skipifsourcedoesntexist`.
- 🟠 First launch could stall on a missing model with no internet. **(fixed: `BootstrapManager` classifies this as `RecoverableOffline` — registers from the bundled GGUF when present, otherwise degrades to safe mode rather than waiting)**

### 2.11 File-system dependency failures
- 🟠 Missing `FACTUM_IL_ROOT` / `node.exe` / low disk were only surfaced late by `StartupValidator`. **(fixed: `BootstrapManager` "deps" step treats these as `Fatal` early, with a precise reason routed to `RecoveryWindow`)**

---

## 3. What was deliberately *not* changed

- The existing `/api/health`, `StartupValidator`, circuit breaker, RAG healing,
  idempotent corpus loaders and post-update rollback are sound and are **reused**.
- No TypeScript "startup orchestrator" package was introduced — orchestration
  belongs in the C# shell where Ollama / WebView2 / model lifecycle actually runs.
- The installer still bundles the GGUF and `register-ollama-model.ps1`; they are
  consumed by the first-launch bootstrap (offline) and kept as a manual recovery
  tool respectively.

See `INSTALLER_ORCHESTRATION_SPEC.md` for the full target architecture, dependency
graph, and the failure-mode test matrix.
