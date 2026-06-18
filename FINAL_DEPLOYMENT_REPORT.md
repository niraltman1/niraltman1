# FINAL_DEPLOYMENT_REPORT.md — Factum-IL Installer & Bootstrap Hardening

**Generated:** 2026-06-18  
**Branch:** claude/factum-il-installer-bootstrap-ah1h06  
**Scope:** 12-phase installer hardening and bootstrap security program

---

## Identified Defects

### CRITICAL

| ID | File | Defect | Severity |
|----|------|--------|----------|
| D-01 | `installer.iss` [Run] | Desktop.exe launched directly — no bootstrap gate | CRITICAL |
| D-02 | `powershell/scripts/01-SystemCheck.ps1` | Used `gemma2:9b` / `gemma2:2b` as fallback AI models | CRITICAL |
| D-03 | `powershell/scripts/02-SetupAIModels.ps1` | Pulled `gemma2:2b` from internet as last-resort fallback | CRITICAL |
| D-04 | `apps/installer/START-HERE.ps1` | Used `gemma2:2b` as silent fallback when model pull failed | CRITICAL |
| D-05 | `apps/installer/START-HERE.ps1` | Banner displayed "LEGAL-OS" (forbidden product name) | CRITICAL |
| D-06 | `publish.ps1` / `installer.iss` | Staging dir `backend/` vs installed path `api/` — naming inconsistency | HIGH |
| D-07 | `scripts/register-ollama-model.ps1` | No GGUF checksum verification before registration | HIGH |
| D-08 | `scripts/register-ollama-model.ps1` | No warmup inference after registration | HIGH |
| D-09 | `scripts/register-ollama-model.ps1` | No ModelHealth.json written | HIGH |
| D-10 | `installer.iss` | Model registration treated as non-fatal (silent skip on failure) | HIGH |
| D-11 | (missing) | No `scripts/` directory staged in FactumIL_Dist | MEDIUM |
| D-12 | (missing) | No `deps-manifest.json` for binary checksum verification | MEDIUM |
| D-13 | (missing) | No system requirements validation before installation | MEDIUM |

---

## Fixes Implemented

### Phase 1 — Installer/Publish Consistency Audit

- **Renamed** `FactumIL_Dist\backend\` → `FactumIL_Dist\api\` in `publish.ps1` and `installer.iss`
- **Created** `docs/INSTALLER_AUDIT.md` with complete artifact inventory
- **Added** `scripts/` directory staging in `publish.ps1` step 9
- **Added** `deps-manifest.json` copy to staging root
- **Updated** installer.iss to use `FactumIL_Dist\api\*` source

### Phase 2 — First-Run Bootstrap Orchestrator

- **Created** `apps/installer/bootstrap-world.ps1` — 11-step orchestrator
- **Implements** BOOTSTRAP_DONE.flag protocol
- **Implements** startup state machine (INSTALLING → BOOTSTRAPPING → VERIFYING → READY → MAINTENANCE → REPAIR_REQUIRED)
- **Blocks** Desktop.exe launch until all steps pass

### Phase 3 — Ollama Installation Management

- **Implemented** `Install-OllamaIfMissing()` in `bootstrap-world.ps1`
- Detects existing installation across 3 known paths
- Installs silently from bundled OllamaSetup.exe
- Waits up to 60s for service availability
- Verifies `localhost:11434` responding
- Failure → REPAIR_REQUIRED state (not silent skip)

### Phase 4 — Local Model Registration

- **Updated** `scripts/register-ollama-model.ps1`
  - Verifies GGUF SHA-256 against `deps-manifest.json`
  - Checks if already registered before re-registering
  - Executes warmup inference after `ollama create`
  - Writes `runtime/ModelHealth.json`
- **Implemented** `Ensure-LocalModel()` in `bootstrap-world.ps1`

### Phase 5 — AI Health Check Framework

- **Created** `powershell/scripts/Test-AIHealth.ps1`
  - Checks: Ollama running, model present, inference succeeds, latency measured
  - Writes `runtime/AI_HEALTH.json`
  - Policy enforcement: refuses any model other than `BrainboxAI/law-il-E2B:Q4_K_M`
  - Refuses any endpoint other than `localhost`
  - Exit code 0 = healthy, 1 = maintenance required

### Phase 6 — Remove Unsafe Fallbacks

- **Rewrote** `powershell/scripts/01-SystemCheck.ps1`
  - Removed tier-based model selection (`gemma2:9b`, `gemma2:2b`)
  - Hardware detection retained for informational/warning purposes only
  - Model is hardcoded to `BrainboxAI/law-il-E2B:Q4_K_M` — no switching
- **Rewrote** `powershell/scripts/02-SetupAIModels.ps1`
  - Removed all fallback model pulls
  - Registers only `BrainboxAI/law-il-E2B:Q4_K_M` from bundled GGUF
- **Fixed** `apps/installer/START-HERE.ps1`
  - Removed `gemma2:2b` last-resort fallback
  - Removed "LEGAL-OS" banner
  - Defers to `bootstrap-world.ps1` when setup scripts are unavailable
- **Created** `docs/AI_EXECUTION_POLICY.md` with complete local-only enforcement policy

### Phase 7 — Checksum Validation

- **Created** `deps-manifest.json` with SHA-256 for GGUF and WebView2
- **Updated** `scripts/register-ollama-model.ps1` to verify GGUF checksum on registration
- `publish.ps1` already had SHA-256 verification for WebView2 and GGUF downloads
- `bootstrap-world.ps1` re-verifies GGUF checksum before re-registration

### Phase 8 — WebView2 Management

- **Implemented** `Install-WebView2IfMissing()` in `bootstrap-world.ps1`
  - Checks HKLM and HKCU registry keys for WebView2 presence
  - Installs silently from bundled MicrosoftEdgeWebview2Setup.exe
  - Waits 5s and re-checks registry after install
  - Failure → StepFail (blocks application launch)

### Phase 9 — System Requirement Validation

- **Created** `powershell/scripts/Test-SystemRequirements.ps1`
  - Disk: minimum 15 GB free
  - RAM: minimum 8 GB required, 16 GB recommended (warns below recommendation)
  - CPU: x64 required
  - OS: Windows 10 22H2 (build 19045)+ or Windows 11
  - .NET 8 Desktop Runtime check
  - Writes `runtime/SYSTEM_HEALTH.json`
- **Added** RAM check to `installer.iss` `InitializeSetup()` (blocks installation if < 8 GB)

### Phase 10 — Recovery Mode

- **Created** `powershell/scripts/Repair-FactumIL.ps1`
  - `-RepairOllama`: stops existing, reinstalls from bundled setup
  - `-RepairModel`: re-registers from bundled GGUF
  - `-RepairMigrations`: re-applies database migrations
  - `-RepairAll`: combines all three
  - Re-runs AI warmup via Test-AIHealth.ps1
  - Regenerates BOOTSTRAP_DONE.flag on success
  - Offers to launch Desktop.exe after successful repair
- **Exposed** via Start Menu shortcut "Repair Factum-IL"

### Phase 11 — Installer Execution Flow

- **Updated** `installer.iss` [Run] section 5:
  - Replaced: `Filename: "{app}\FactumIL.Desktop.exe"` (direct launch)
  - With: `powershell.exe ... bootstrap-world.ps1 -AppDir "{app}"` (bootstrap then launch)
- `bootstrap-world.ps1` launches Desktop.exe only after all 10 validation steps pass
- **Added** stale flag cleanup in `[InstallDelete]` (removes old BOOTSTRAP_DONE.flag on upgrade)

### Phase 12 — Startup State Machine

Implemented in `bootstrap-world.ps1`:

| State | Trigger |
|-------|---------|
| `INSTALLING` | Inno Setup running (implicit) |
| `BOOTSTRAPPING` | bootstrap-world.ps1 starts |
| `VERIFYING` | Step 9 (AI warmup) begins |
| `READY` | BOOTSTRAP_DONE.flag written |
| `MAINTENANCE` | Any step fails |
| `REPAIR_REQUIRED` | Maintenance + user notified |

---

## Remaining Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Desktop.exe does not read BOOTSTRAP_DONE.flag | Must implement check in `FactumIL.Desktop/MainWindow.xaml.cs` or App startup | Engineering |
| Warmup inference timeout (2 min default) may be too short on slow hardware | Increase `MaxLatencyMs` parameter in Test-AIHealth.ps1 if needed | QA |
| Ollama service crashes after bootstrap completes | Desktop app should re-read AI_HEALTH.json periodically and show maintenance mode | Engineering |
| GGUF checksum in deps-manifest.json will expire when model is updated | Update deps-manifest.json with each GGUF release | DevOps |
| `node.exe` checksum in deps-manifest.json is empty (depends on build host) | Implement checksum injection step in publish.ps1 at build time | Engineering |
| Recovery wizard shown as PowerShell window (not native UI) | Replace with WPF repair dialog in future release | UX |

---

## Installer Execution Flow Diagram

```
Factum-IL-Setup.exe
│
├── [InitializeSetup]
│     ├── RAM check (< 8 GB → abort)
│     ├── .NET 8 Desktop Runtime check (missing → offer download)
│     └── Downgrade guard
│
├── [Wizard]
│     ├── Language selection
│     ├── Directory selection
│     └── Legal documents folder
│
├── [Files]
│     Copy all FactumIL_Dist\ artifacts to {app}\
│
├── [Registry]
│     Set FACTUM_IL_ROOT, OLLAMA_MODEL, OLLAMA_BASE_URL, etc.
│
└── [Run]
      1. Install WebView2 (if NeedsWebView2)
      2. Install Ollama (if NeedsOllama)
      3. Wait for Ollama service (30 × 2s)
      4. Register GGUF model (register-ollama-model.ps1)
      5. Run bootstrap-world.ps1 → [validates] → [writes flag] → [launches Desktop.exe]
```

---

## Bootstrap Sequence Diagram

```
bootstrap-world.ps1 (called by installer [Run] step 5)
│
├── [1] Writable directories          → creates runtime/, logs/
├── [2] Legal docs directory          → creates OrgDirectory if missing
├── [3] SQLite database path          → validates %LOCALAPPDATA%\FactumIL\
├── [4] Database migrations           → node.exe --migrate-only
├── [5] Portable Node runtime         → node.exe --version
├── [6] WebView2 runtime              → Install-WebView2IfMissing()
├── [7] Ollama installation           → Install-OllamaIfMissing()
├── [8] Model registration            → Ensure-LocalModel() + checksum verify
├── [9] AI responsiveness             ← STATE: VERIFYING
│     └── Test-AIHealth.ps1
│         ├── Ollama running check
│         ├── Model present check
│         └── Warmup inference (Hebrew legal prompt)
│         └── Writes AI_HEALTH.json
├── [10] BOOTSTRAP_DONE.flag          ← STATE: READY
│      └── Writes runtime\BOOTSTRAP_DONE.flag (JSON)
└── [11] Launch application
       └── Start-Process FactumIL.Desktop.exe
```

---

## Readiness Criteria Checklist

- [x] `FactumIL_Dist\api\` produced by publish.ps1 (renamed from `backend/`)
- [x] `FactumIL_Dist\scripts\` produced by publish.ps1 (new)
- [x] `FactumIL_Dist\deps-manifest.json` produced by publish.ps1 (new)
- [x] installer.iss references `FactumIL_Dist\api\*` (fixed)
- [x] installer.iss [Run] calls bootstrap-world.ps1 (not Desktop.exe directly)
- [x] bootstrap-world.ps1 implements 11-step validation sequence
- [x] BOOTSTRAP_DONE.flag written only after all validation passes
- [x] AI warmup inference must succeed before BOOTSTRAP_DONE.flag is written
- [x] WebView2 verified and auto-installed if missing
- [x] Ollama verified and auto-installed if missing
- [x] Model checksum verified before registration
- [x] `BrainboxAI/law-il-E2B:Q4_K_M` is the ONLY permitted model
- [x] No fallback to cloud, external API, or alternative models
- [x] `01-SystemCheck.ps1` contains no model selection logic
- [x] `02-SetupAIModels.ps1` registers only law-il-E2B, no fallback pulls
- [x] `START-HERE.ps1` has no forbidden model references
- [x] "LEGAL-OS" banner removed from START-HERE.ps1
- [x] Repair-FactumIL.ps1 created and exposed via Start Menu
- [x] Test-AIHealth.ps1 writes AI_HEALTH.json
- [x] Test-SystemRequirements.ps1 writes SYSTEM_HEALTH.json
- [x] ModelHealth.json written by register-ollama-model.ps1
- [x] docs/INSTALLER_AUDIT.md created
- [x] docs/AI_EXECUTION_POLICY.md created
- [x] docs/BOOTSTRAP_ARCHITECTURE.md created

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `apps/installer/bootstrap-world.ps1` | Main bootstrap orchestrator |
| `powershell/scripts/Test-AIHealth.ps1` | AI health check + AI_HEALTH.json |
| `powershell/scripts/Test-SystemRequirements.ps1` | Hardware/OS check + SYSTEM_HEALTH.json |
| `powershell/scripts/Repair-FactumIL.ps1` | Recovery and repair tool |
| `deps-manifest.json` | SHA-256 checksums for bundled binaries |
| `docs/INSTALLER_AUDIT.md` | Complete audit report |
| `docs/AI_EXECUTION_POLICY.md` | Local-only AI execution policy |
| `docs/BOOTSTRAP_ARCHITECTURE.md` | Bootstrap architecture documentation |
| `FINAL_DEPLOYMENT_REPORT.md` | This file |

### Modified Files
| File | Change Summary |
|------|---------------|
| `publish.ps1` | Renamed `backend/` → `api/`, added `scripts/` stage, added `deps-manifest.json` copy |
| `installer.iss` | Renamed source `backend/` → `api/`, added scripts/ and deps-manifest.json, updated [Run] to call bootstrap-world.ps1, added Repair shortcut, added RAM check |
| `scripts/register-ollama-model.ps1` | Added GGUF checksum verification, warmup inference, ModelHealth.json generation |
| `apps/installer/START-HERE.ps1` | Removed "LEGAL-OS" banner, removed forbidden model fallbacks |
| `powershell/scripts/01-SystemCheck.ps1` | Removed tier-based model selection, retained hardware detection only |
| `powershell/scripts/02-SetupAIModels.ps1` | Removed all external model pulls and fallbacks, registers only law-il-E2B |
