# INSTALLER_AUDIT.md — Factum-IL Installer/Publish Consistency Audit

Generated: 2026-06-18  
Scope: `publish.ps1` ↔ `installer.iss` (repo root)

---

## Summary

| Category | Count |
|----------|-------|
| Path mismatches found | 3 |
| Missing artifact references | 1 |
| Unused installer references | 0 |
| Naming inconsistencies | 2 |
| Forbidden model references | 4 |
| Status after fixes | ✅ All resolved |

---

## 1. Staging Directory Naming Mismatch (CRITICAL)

### Issue
`publish.ps1` stages the Express API to:
```
FactumIL_Dist\backend\
```

`installer.iss` source matches `FactumIL_Dist\backend\*` but install layout docs and header comments refer to `app\api\`. The staging name `backend` and the installed name `api` diverge, causing confusion in every reference (log messages, validation checks, documentation).

### Fix Applied
Renamed staging subdirectory throughout both files:

| Before | After |
|--------|-------|
| `FactumIL_Dist\backend\` | `FactumIL_Dist\api\` |
| `$BackendOut = "…\backend"` | `$BackendOut = "…\api"` |
| `Source: "FactumIL_Dist\backend\*"` | `Source: "FactumIL_Dist\api\*"` |

---

## 2. Missing `scripts/` Stage Directory

### Issue
The expected deployment layout includes a `scripts/` directory:
```
FactumIL_Dist/
    scripts/    ← not staged by publish.ps1
```

The bootstrap scripts (bootstrap-world.ps1, Test-AIHealth.ps1, Test-SystemRequirements.ps1, Repair-FactumIL.ps1) must be staged here and installed to `{app}\scripts\`.

### Fix Applied
`publish.ps1` now stages `powershell/scripts/*.ps1` and `apps/installer/bootstrap-world.ps1` into `FactumIL_Dist\scripts\`.

`installer.iss` now includes:
```
Source: "FactumIL_Dist\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion
```

---

## 3. Installer Launches Desktop.exe Directly (CRITICAL)

### Issue
`installer.iss` [Run] step 5 launches `{app}\FactumIL.Desktop.exe` immediately after installation with no bootstrap gate. A fresh install may have:
- Ollama not yet running
- Model not registered
- Migrations not applied
- WebView2 installation not verified

### Fix Applied
[Run] step 5 now calls `bootstrap-world.ps1` instead of `Desktop.exe`:
```
Filename: "powershell.exe";
  Parameters: "... -File ""{app}\scripts\bootstrap-world.ps1"" -AppDir ""{app}""";
  Flags: waituntilterminated postinstall skipifsilent
```

`bootstrap-world.ps1` launches `Desktop.exe` only after all validation passes and writes `runtime\BOOTSTRAP_DONE.flag`.

---

## 4. Model Registration Non-Fatal Fallback (CRITICAL)

### Issue
Both `[Run]` sections 3 and 4 in `installer.iss` treat Ollama service startup and model registration as non-fatal (`exit 0` in all error paths). A failed registration silently leaves the AI in a broken state.

### Fix Applied
`bootstrap-world.ps1` enforces strict model health verification:
- Model registration failure → REPAIR_REQUIRED state (not silent skip)
- Warmup inference must succeed before writing BOOTSTRAP_DONE.flag
- `runtime/AI_HEALTH.json` written with detailed status fields

---

## 5. Forbidden AI Model Fallbacks (CRITICAL)

### Issue
The following files reference forbidden alternative models:

| File | Line | Violation |
|------|------|-----------|
| `powershell/scripts/01-SystemCheck.ps1` | 35-44 | `gemma2:9b` (standard tier), `gemma2:2b` (low tier) |
| `powershell/scripts/02-SetupAIModels.ps1` | 58-68 | `gemma2:2b` fallback on pull failure |
| `apps/installer/START-HERE.ps1` | 254-259 | `gemma2:2b` last-resort fallback |
| `apps/installer/START-HERE.ps1` | 82 | "LEGAL-OS" in banner (forbidden name) |

**The ONLY permitted model is: `BrainboxAI/law-il-E2B:Q4_K_M`**

### Fix Applied
- `01-SystemCheck.ps1`: Removed tier-based model selection. Hardware detection retained (RAM, GPU, disk) for informational purposes only. No model switching.
- `02-SetupAIModels.ps1`: Rewrote to register only `BrainboxAI/law-il-E2B:Q4_K_M`. No fallback pulls.
- `START-HERE.ps1`: Removed `gemma2:2b` fallback. Removed "LEGAL-OS" banner reference.

---

## 6. `register-ollama-model.ps1` Lacks Health Verification

### Issue
The model registration script:
1. Does not verify GGUF checksum before registration
2. Does not execute a warmup inference
3. Does not write `ModelHealth.json`

### Fix Applied
`scripts/register-ollama-model.ps1` now:
- Verifies GGUF SHA-256 against `deps-manifest.json`
- Executes warmup inference after `ollama create`
- Writes `{app}\runtime\ModelHealth.json` with full status

---

## 7. Complete Artifact Inventory

### Staged by publish.ps1 → Installed by installer.iss

| Staging Path | Install Destination | Status |
|---|---|---|
| `FactumIL_Dist\shell\*` | `{app}\` | ✅ |
| `FactumIL_Dist\runtime\node.exe` | `{app}\app\node\node.exe` | ✅ |
| `FactumIL_Dist\api\*` | `{app}\app\api\` | ✅ (renamed from `backend\`) |
| `FactumIL_Dist\dashboard\*` | `{app}\app\dashboard\` | ✅ |
| `FactumIL_Dist\migrations\*` | `{app}\app\migrations\` | ✅ |
| `FactumIL_Dist\legal-corpus\*` | `{app}\app\legal-corpus\` | ✅ (skipifsourcedoesntexist) |
| `FactumIL_Dist\powershell\lib\*` | `{app}\powershell\lib\` | ✅ |
| `FactumIL_Dist\tools\OllamaSetup.exe` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\tools\MicrosoftEdgeWebview2Setup.exe` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\tools\whisper-fast.exe` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\tools\ffmpeg.exe` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\tools\sqlite-vec.dll` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\tools\register-ollama-model.ps1` | `{app}\tools\` | ✅ |
| `FactumIL_Dist\models\*.gguf` | `{app}\models\` | ✅ |
| `FactumIL_Dist\scripts\*` | `{app}\scripts\` | ✅ (new — bootstrap scripts) |
| `assets\logo\factum-il-icon.ico` | `{app}\assets\logo\` | ✅ |
| `deps-manifest.json` | `{app}\` | ✅ (new) |

### Not staged (runtime-generated, correct)

| Path | Reason |
|------|--------|
| `%LOCALAPPDATA%\FactumIL\factum-il.db` | Created by MigrationRunner on first boot |
| `%LOCALAPPDATA%\FactumIL\logs\` | Created at runtime |
| `{app}\runtime\BOOTSTRAP_DONE.flag` | Written by bootstrap-world.ps1 |
| `{app}\runtime\ModelHealth.json` | Written by register-ollama-model.ps1 |
| `{app}\runtime\AI_HEALTH.json` | Written by Test-AIHealth.ps1 |
| `{app}\runtime\SYSTEM_HEALTH.json` | Written by Test-SystemRequirements.ps1 |

---

## 8. Registry Entries (installer.iss → verified by Verify-Install.ps1)

All registry values remain unchanged:

| Key | Value |
|-----|-------|
| `FACTUM_IL_ROOT` | `{app}\app` |
| `WHISPER_EXE` | `{app}\tools\whisper-fast.exe` |
| `FFMPEG_EXE` | `{app}\tools\ffmpeg.exe` |
| `OLLAMA_MODEL` | `BrainboxAI/law-il-E2B:Q4_K_M` |
| `AI_TIER` | `standard` |
| `SQLITE_VEC_PATH` | `{app}\tools\sqlite-vec.dll` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` |
| `FACTUM_IL_VERSION` | `1.0.0` |
| `SOFTWARE\Factum IL\OrgDirectory` | User-selected legal docs directory |
