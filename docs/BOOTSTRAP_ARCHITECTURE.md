# BOOTSTRAP_ARCHITECTURE.md — Factum-IL First-Run Bootstrap Architecture

**Version:** 1.0  
**Date:** 2026-06-18

---

## Overview

The bootstrap system ensures a fresh Factum-IL installation can never enter the application in a degraded state. Every required component must be verified and operational before the desktop shell becomes available.

---

## Startup State Machine

```
  [INSTALLING]
      │ Inno Setup completes file copy
      ▼
  [BOOTSTRAPPING]
      │ bootstrap-world.ps1 launched
      │ Steps 1-10 execute sequentially
      ▼
  [VERIFYING]
      │ Test-AIHealth.ps1 runs
      │ AI warmup inference executes
      │ AI_HEALTH.json written
      ▼
  [READY]
      │ BOOTSTRAP_DONE.flag written
      │ FactumIL.Desktop.exe launched
      ▼
  [APPLICATION RUNNING]
      
  ─── On any step failure ───►  [MAINTENANCE]
                                     │
                         User triggers repair
                                     │
                         [REPAIR_REQUIRED]
                                     │
                         Repair-FactumIL.ps1 runs
                                     │
                         Retry from BOOTSTRAPPING
```

### State Definitions

| State | Meaning |
|-------|---------|
| `INSTALLING` | Inno Setup is copying files. Application is not available. |
| `BOOTSTRAPPING` | bootstrap-world.ps1 is running through its 11-step sequence. |
| `VERIFYING` | AI health check in progress — warmup inference executing. |
| `READY` | All checks passed. BOOTSTRAP_DONE.flag written. Desktop launching. |
| `MAINTENANCE` | A non-recoverable check failed. AI features disabled. User notified. |
| `REPAIR_REQUIRED` | Manual repair needed. Repair-FactumIL.ps1 must be run. |

**The application NEVER enters READY without passing through VERIFYING.**

---

## Bootstrap Sequence (bootstrap-world.ps1)

```
bootstrap-world.ps1
│
├─ [Step 1]  Verify writable application directories
│            {app}\runtime\, {app}\logs\, %LOCALAPPDATA%\FactumIL\
│
├─ [Step 2]  Verify legal documents root directory
│            Registry: SOFTWARE\Factum IL\OrgDirectory
│            Creates directory if missing
│
├─ [Step 3]  Verify SQLite database path
│            %LOCALAPPDATA%\FactumIL\factum-il.db (existence or creatable)
│
├─ [Step 4]  Apply pending migrations
│            node.exe {app}\app\api\dist\start.js --migrate-only
│            OR direct MigrationRunner call
│
├─ [Step 5]  Verify portable Node runtime
│            {app}\app\node\node.exe --version → must exit 0
│
├─ [Step 6]  Verify WebView2 runtime
│            Registry: SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3...}
│            Install silently if missing
│
├─ [Step 7]  Verify Ollama installation
│            Install-OllamaIfMissing() — detect, install, wait, verify
│
├─ [Step 8]  Verify local model registration
│            Ensure-LocalModel() — GGUF checksum, ollama create, ollama list
│
├─ [Step 9]  Verify local AI responsiveness
│            Test-AIHealth.ps1 — HTTP POST to /api/generate with test prompt
│            Writes runtime\AI_HEALTH.json
│
├─ [Step 10] Generate readiness marker
│            Write runtime\BOOTSTRAP_DONE.flag
│
└─ [Step 11] Launch application
             Start-Process {app}\FactumIL.Desktop.exe
```

---

## Readiness Flag Protocol

### Flag location
```
{app}\runtime\BOOTSTRAP_DONE.flag
```

### Flag content
```json
{
  "bootstrappedAt": "2026-06-18T12:00:00Z",
  "bootstrapVersion": "1.0",
  "nodeVerified": true,
  "webView2Verified": true,
  "ollamaVerified": true,
  "modelVerified": true,
  "aiWarmupPassed": true,
  "migrationsApplied": true
}
```

### Desktop shell behavior
- On startup, `FactumIL.Desktop.exe` reads `runtime\BOOTSTRAP_DONE.flag`
- If absent → show bootstrap dialog, offer to run bootstrap-world.ps1
- If present but `aiWarmupPassed: false` → enter MAINTENANCE state
- If present and all fields true → normal startup

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/installer/bootstrap-world.ps1` | Main bootstrap orchestrator |
| `powershell/scripts/Test-AIHealth.ps1` | AI health check, writes AI_HEALTH.json |
| `powershell/scripts/Test-SystemRequirements.ps1` | Hardware/OS validation, writes SYSTEM_HEALTH.json |
| `powershell/scripts/Repair-FactumIL.ps1` | Recovery mode — reinstall components |
| `scripts/register-ollama-model.ps1` | Model registration + warmup, writes ModelHealth.json |
| `deps-manifest.json` | SHA-256 checksums for all bundled binaries |

---

## Runtime Health Files

All written to `{app}\runtime\`:

### BOOTSTRAP_DONE.flag
Written by `bootstrap-world.ps1` after all steps pass. Absence blocks application launch.

### AI_HEALTH.json
```json
{
  "timestamp": "2026-06-18T12:00:00Z",
  "ollamaRunning": true,
  "modelPresent": true,
  "inferenceSucceeded": true,
  "latencyMs": 3200,
  "modelName": "BrainboxAI/law-il-E2B:Q4_K_M",
  "endpoint": "http://localhost:11434"
}
```

### ModelHealth.json
```json
{
  "installed": true,
  "registered": true,
  "loaded": true,
  "warmupPassed": true,
  "checksumVerified": true,
  "timestamp": "2026-06-18T12:00:00Z",
  "modelTag": "BrainboxAI/law-il-E2B:Q4_K_M"
}
```

### SYSTEM_HEALTH.json
```json
{
  "timestamp": "2026-06-18T12:00:00Z",
  "diskFreeGB": 45.2,
  "diskMeetsMinimum": true,
  "ramGB": 32.0,
  "ramMeetsMinimum": true,
  "cpuArch": "x64",
  "cpuSupported": true,
  "osVersion": "10.0.22621.0",
  "osSupported": true,
  "overallPass": true
}
```

---

## Installer Execution Flow

```
Factum-IL-Setup.exe
      │
      ├─ [InitializeSetup]
      │    Check .NET 8 Desktop Runtime
      │    Downgrade guard
      │
      ├─ [Wizard Pages]
      │    Language, directory, legal docs folder
      │
      ├─ [Files]
      │    Copy all staged artifacts from FactumIL_Dist\
      │
      ├─ [Registry]
      │    Set FACTUM_IL_ROOT, OLLAMA_MODEL, etc.
      │
      └─ [Run]
           1. Install WebView2 (if NeedsWebView2)
           2. Install Ollama (if NeedsOllama)
           3. Wait for Ollama service (up to 60s)
           4. Register GGUF model (register-ollama-model.ps1)
           5. Run bootstrap-world.ps1 (full validation + launch)
```

**Desktop.exe is never launched directly by Inno Setup [Run].  
Only bootstrap-world.ps1 launches Desktop.exe, and only after all validation passes.**

---

## Recovery Architecture

```
User reports broken installation
        │
        ▼
Start Menu: "Repair Factum-IL"
        │
        ▼
Repair-FactumIL.ps1
        │
        ├─ Reinstall Ollama (if missing/broken)
        ├─ Re-register model from bundled GGUF
        ├─ Run Test-AIHealth.ps1
        ├─ Rebuild database migrations
        ├─ Regenerate runtime flags
        │
        ▼
bootstrap-world.ps1 (re-run)
        │
        ▼
BOOTSTRAP_DONE.flag written
        │
        ▼
Desktop.exe launches
```
