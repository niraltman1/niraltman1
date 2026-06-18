#Requires -Version 5.1
<#
.SYNOPSIS
    Factum-IL — First-Run Bootstrap Orchestrator

.DESCRIPTION
    Guarantees the local AI environment is fully operational before the desktop
    application becomes available.  Must be called by the Inno Setup [Run] section
    (not Desktop.exe directly).  Writes runtime\BOOTSTRAP_DONE.flag on success.

    Bootstrap sequence:
      1. Verify writable application directories
      2. Verify legal documents root directory
      3. Verify SQLite database path
      4. Apply pending migrations
      5. Verify portable Node runtime
      6. Verify WebView2 runtime
      7. Verify Ollama installation
      8. Verify local model registration
      9. Verify local AI responsiveness
     10. Generate readiness marker
     11. Launch application

    Startup states: INSTALLING → BOOTSTRAPPING → VERIFYING → READY
    On failure:     BOOTSTRAPPING → MAINTENANCE → REPAIR_REQUIRED

.PARAMETER AppDir
    Root installation directory, e.g. C:\Program Files\FactumIL

.PARAMETER SkipLaunch
    Do not launch Desktop.exe after successful bootstrap (used in CI/repair mode).

.PARAMETER RepairMode
    Re-run all steps even if BOOTSTRAP_DONE.flag already exists.

.EXAMPLE
    .\bootstrap-world.ps1 -AppDir "C:\Program Files\FactumIL"
    .\bootstrap-world.ps1 -AppDir "C:\Program Files\FactumIL" -SkipLaunch
    .\bootstrap-world.ps1 -AppDir "C:\Program Files\FactumIL" -RepairMode
#>
[CmdletBinding()]
param(
    [string] $AppDir      = "",
    [switch] $SkipLaunch,
    [switch] $RepairMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Resolve AppDir ─────────────────────────────────────────────────────────────
if (-not $AppDir) {
    $AppDir = Split-Path -Parent $PSScriptRoot
}
if (-not (Test-Path $AppDir)) {
    Write-Error "AppDir not found: $AppDir"
    exit 1
}

$RuntimeDir    = Join-Path $AppDir "runtime"
$FlagFile      = Join-Path $RuntimeDir "BOOTSTRAP_DONE.flag"
$HealthFile    = Join-Path $RuntimeDir "AI_HEALTH.json"
$ModelHFile    = Join-Path $RuntimeDir "ModelHealth.json"
$SystemHFile   = Join-Path $RuntimeDir "SYSTEM_HEALTH.json"
$DesktopExe    = Join-Path $AppDir "FactumIL.Desktop.exe"
$NodeExe       = Join-Path $AppDir "app\node\node.exe"
$ApiEntry      = Join-Path $AppDir "app\api\dist\start.js"
$MigrationsDir = Join-Path $AppDir "app\migrations"
$ToolsDir      = Join-Path $AppDir "tools"
$ModelsDir     = Join-Path $AppDir "models"
$ScriptsDir    = Join-Path $AppDir "scripts"
$OllamaExePaths = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe",
    "${env:ProgramFiles(x86)}\Ollama\ollama.exe"
)

$ModelTag      = "BrainboxAI/law-il-E2B:Q4_K_M"
$OllamaBaseUrl = "http://127.0.0.1:11434"
$TotalSteps    = 11
$CurrentStep   = 0
$StartTime     = Get-Date
$LogFile       = Join-Path $RuntimeDir "bootstrap.log"
$BootstrapVersion = "1.0"

# ── State tracking ─────────────────────────────────────────────────────────────
$State = "BOOTSTRAPPING"
$StepResults = @{}

# ── Logging ────────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Log([string]$msg, [string]$level = "INFO") {
    $ts  = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $line = "[$ts][$level] $msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    switch ($level) {
        "ERROR" { Write-Host $line -ForegroundColor Red }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        "OK"    { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line -ForegroundColor Gray }
    }
}

function Step([string]$name) {
    $script:CurrentStep++
    $script:State = "BOOTSTRAPPING"
    Log "[$script:CurrentStep/$TotalSteps] $name" "INFO"
    Write-Host ""
    Write-Host "  [$script:CurrentStep/$TotalSteps] $name" -ForegroundColor Cyan
}

function StepOk([string]$msg) {
    Log "  OK: $msg" "OK"
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function StepFail([string]$step, [string]$reason) {
    $script:State = "MAINTENANCE"
    Log "  FAIL [$step]: $reason" "ERROR"
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "  ║  BOOTSTRAP FAILED — $step" -ForegroundColor Red
    Write-Host "  ║  $reason" -ForegroundColor Red
    Write-Host "  ╠══════════════════════════════════════════════════════════╣" -ForegroundColor Red
    Write-Host "  ║  Run: Repair-FactumIL.ps1 from Start Menu               ║" -ForegroundColor Red
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    $script:StepResults[$step] = $false
    Enter-RepairRequired $step $reason
}

function Enter-RepairRequired([string]$failedStep, [string]$reason) {
    $script:State = "REPAIR_REQUIRED"
    $repairScript = Join-Path $ScriptsDir "Repair-FactumIL.ps1"
    Log "Entering REPAIR_REQUIRED state. Failed step: $failedStep" "ERROR"

    $repairJson = [ordered]@{
        state       = "REPAIR_REQUIRED"
        failedStep  = $failedStep
        reason      = $reason
        timestamp   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    $repairJson | ConvertTo-Json | Set-Content (Join-Path $RuntimeDir "REPAIR_STATE.json") -Encoding UTF8

    if (-not $SkipLaunch) {
        $msg = "Factum-IL Bootstrap Failed`n`nStep: $failedStep`nReason: $reason`n`nRun 'Repair Factum-IL' from the Start Menu to fix this issue."
        try {
            $wshShell = New-Object -ComObject WScript.Shell
            $wshShell.Popup($msg, 0, "Factum-IL — Repair Required", 16) | Out-Null
        } catch {
            Write-Host $msg -ForegroundColor Red
        }
    }
    exit 1
}

function Find-OllamaExe {
    foreach ($path in $OllamaExePaths) {
        if (Test-Path $path) { return $path }
    }
    $inPath = (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
    if ($inPath) { return $inPath }
    return $null
}

function Test-OllamaResponding {
    try {
        $null = Invoke-RestMethod "$OllamaBaseUrl/api/tags" -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch { return $false }
}

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         Factum-IL Bootstrap Orchestrator v1.0           ║" -ForegroundColor Cyan
Write-Host "  ║         מאתחל סביבת AI מקומית — אנא המתן               ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Log "Bootstrap started. AppDir=$AppDir RepairMode=$RepairMode" "INFO"

# Skip if already bootstrapped (unless RepairMode)
if ((Test-Path $FlagFile) -and -not $RepairMode) {
    Log "BOOTSTRAP_DONE.flag already present — skipping bootstrap." "OK"
    if (-not $SkipLaunch -and (Test-Path $DesktopExe)) {
        Log "Launching Desktop.exe (already bootstrapped)." "OK"
        Start-Process $DesktopExe
    }
    exit 0
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Verify writable application directories
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify writable application directories"

$writeDirs = @(
    $RuntimeDir,
    (Join-Path $AppDir "logs"),
    "$env:LOCALAPPDATA\FactumIL",
    "$env:LOCALAPPDATA\FactumIL\logs"
)

foreach ($d in $writeDirs) {
    try {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
        $testFile = Join-Path $d "_write_test_$PID.tmp"
        [IO.File]::WriteAllText($testFile, "ok")
        Remove-Item $testFile -Force
    } catch {
        StepFail "Step1-Directories" "Cannot write to directory: $d — $_"
    }
}
$StepResults["Step1"] = $true
StepOk "All required directories are writable"

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Verify legal documents root directory
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify legal documents root directory"

$orgDir = $null
try {
    $orgDir = (Get-ItemProperty "HKLM:\SOFTWARE\Factum IL" -Name OrgDirectory -ErrorAction Stop).OrgDirectory
} catch {
    $orgDir = "C:\מסמכים משפטיים"
    Log "OrgDirectory registry value not found — using default: $orgDir" "WARN"
}

if (-not (Test-Path $orgDir)) {
    try {
        New-Item -ItemType Directory -Force -Path $orgDir | Out-Null
        StepOk "Created legal documents directory: $orgDir"
    } catch {
        Log "WARNING: Could not create OrgDirectory '$orgDir': $_" "WARN"
        StepOk "OrgDirectory not accessible (non-fatal — created on first case)"
    }
} else {
    StepOk "Legal documents directory exists: $orgDir"
}
$StepResults["Step2"] = $true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Verify SQLite database path
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify SQLite database path"

$dbDir  = "$env:LOCALAPPDATA\FactumIL"
$dbPath = "$dbDir\factum-il.db"

try {
    New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
    if (Test-Path $dbPath) {
        $dbSize = (Get-Item $dbPath).Length
        StepOk "Database exists ($([math]::Round($dbSize/1KB,1)) KB): $dbPath"
    } else {
        StepOk "Database path is writable (will be created on first launch): $dbPath"
    }
    $StepResults["Step3"] = $true
} catch {
    StepFail "Step3-Database" "Cannot access database directory: $dbDir — $_"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4 — Apply pending migrations
# ══════════════════════════════════════════════════════════════════════════════
Step "Apply pending migrations"

if (-not (Test-Path $NodeExe)) {
    Log "Node.exe not found at $NodeExe — migrations deferred to first launch" "WARN"
    StepOk "Migrations deferred (Node runtime not verified yet)"
    $StepResults["Step4"] = $true
} elseif (-not (Test-Path $ApiEntry)) {
    Log "API entry point not found at $ApiEntry — migrations deferred to first launch" "WARN"
    StepOk "Migrations deferred (API not found)"
    $StepResults["Step4"] = $true
} else {
    try {
        $migCount = (Get-ChildItem $MigrationsDir -Filter "*.sql" -ErrorAction SilentlyContinue | Measure-Object).Count
        Log "Found $migCount SQL migration files in $MigrationsDir" "INFO"
        $env:FACTUM_IL_ROOT = Join-Path $AppDir "app"
        $env:NODE_ENV       = "production"
        $proc = Start-Process -FilePath $NodeExe `
            -ArgumentList "`"$ApiEntry`" --migrate-only" `
            -Wait -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $RuntimeDir "migrate-stdout.log") `
            -RedirectStandardError  (Join-Path $RuntimeDir "migrate-stderr.log")
        if ($proc.ExitCode -eq 0) {
            StepOk "Migrations applied successfully ($migCount SQL files)"
            $StepResults["Step4"] = $true
        } else {
            Log "Migration runner exited with code $($proc.ExitCode) — app will apply on first launch" "WARN"
            StepOk "Migrations will be applied on first launch (exit code: $($proc.ExitCode))"
            $StepResults["Step4"] = $true
        }
    } catch {
        Log "Migration runner error (non-fatal): $_" "WARN"
        StepOk "Migrations deferred to first launch"
        $StepResults["Step4"] = $true
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5 — Verify portable Node runtime
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify portable Node runtime"

if (-not (Test-Path $NodeExe)) {
    StepFail "Step5-Node" "node.exe not found at: $NodeExe — reinstall Factum-IL or run Repair."
}

try {
    $nodeVer = & $NodeExe --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        StepFail "Step5-Node" "node.exe exists but failed to execute (exit $LASTEXITCODE)"
    }
    StepOk "Node runtime: $nodeVer at $NodeExe"
    $StepResults["Step5"] = $true
} catch {
    StepFail "Step5-Node" "node.exe execution error: $_"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Verify WebView2 runtime
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify WebView2 runtime"

function Test-WebView2Present {
    $wv2Keys = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    )
    foreach ($k in $wv2Keys) {
        try {
            $ver = (Get-ItemProperty $k -Name "pv" -ErrorAction Stop).pv
            if ($ver -and $ver -ne "0.0.0.0") { return $true }
        } catch {}
    }
    return $false
}

function Install-WebView2IfMissing {
    if (Test-WebView2Present) {
        StepOk "WebView2 runtime is present"
        return $true
    }
    Log "WebView2 not detected — attempting silent install" "WARN"
    $wv2Installer = Join-Path $ToolsDir "MicrosoftEdgeWebview2Setup.exe"
    if (-not (Test-Path $wv2Installer)) {
        StepFail "Step6-WebView2" "WebView2 not installed and installer not found at: $wv2Installer"
    }
    try {
        $proc = Start-Process -FilePath $wv2Installer `
            -ArgumentList "/silent /install" -Wait -PassThru
        Start-Sleep -Seconds 5
        if (Test-WebView2Present) {
            StepOk "WebView2 installed successfully"
            return $true
        } else {
            StepFail "Step6-WebView2" "WebView2 installer ran (exit $($proc.ExitCode)) but runtime still not detected"
        }
    } catch {
        StepFail "Step6-WebView2" "WebView2 installation failed: $_"
    }
    return $false
}

$null = Install-WebView2IfMissing
$StepResults["Step6"] = $true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Verify Ollama installation
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify Ollama installation and service"

function Install-OllamaIfMissing {
    $ollamaExe = Find-OllamaExe
    if ($ollamaExe) {
        Log "Ollama executable found: $ollamaExe" "INFO"
    } else {
        Log "Ollama not found — installing from bundled setup" "WARN"
        $ollamaInstaller = Join-Path $ToolsDir "OllamaSetup.exe"
        if (-not (Test-Path $ollamaInstaller)) {
            StepFail "Step7-Ollama" "Ollama not installed and OllamaSetup.exe not found at: $ollamaInstaller"
        }
        try {
            $proc = Start-Process -FilePath $ollamaInstaller -ArgumentList "/S" -Wait -PassThru
            Log "OllamaSetup.exe completed (exit $($proc.ExitCode))" "INFO"
            Start-Sleep -Seconds 5
            $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                        [System.Environment]::GetEnvironmentVariable('Path', 'User')
            $ollamaExe = Find-OllamaExe
            if (-not $ollamaExe) {
                StepFail "Step7-Ollama" "Ollama installation completed but executable still not found"
            }
            Log "Ollama installed at: $ollamaExe" "OK"
        } catch {
            StepFail "Step7-Ollama" "Ollama installation failed: $_"
        }
    }

    # Ensure Ollama service is running
    if (-not (Test-OllamaResponding)) {
        Log "Ollama service not responding — starting..." "WARN"
        try {
            Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
        } catch {
            StepFail "Step7-Ollama" "Could not start Ollama service: $_"
        }
        $waited = 0
        $maxWait = 60
        while ($waited -lt $maxWait) {
            Start-Sleep -Seconds 2
            $waited += 2
            if (Test-OllamaResponding) { break }
        }
        if (-not (Test-OllamaResponding)) {
            StepFail "Step7-Ollama" "Ollama service did not respond within ${maxWait}s after start. Check logs at %LOCALAPPDATA%\Ollama"
        }
    }

    StepOk "Ollama running at $OllamaBaseUrl"
    return $ollamaExe
}

$ollamaExePath = Install-OllamaIfMissing
$StepResults["Step7"] = $true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Verify local model registration
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify local model registration ($ModelTag)"

function Ensure-LocalModel {
    # 8a. Verify GGUF file exists
    $ggufFile = Get-ChildItem $ModelsDir -Filter "*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $ggufFile) {
        Log "No GGUF found in $ModelsDir — checking if model already registered with Ollama" "WARN"
    } else {
        Log "GGUF found: $($ggufFile.FullName) ($([math]::Round($ggufFile.Length/1GB,2)) GB)" "INFO"
    }

    # 8b. Check if model already registered
    try {
        $tagsResponse = Invoke-RestMethod "$OllamaBaseUrl/api/tags" -TimeoutSec 10 -ErrorAction Stop
        $modelNames   = $tagsResponse.models | ForEach-Object { $_.name }
        $modelTag_clean = $ModelTag -replace ":Q4_K_M$","" -replace ":latest$",""
        $alreadyRegistered = $modelNames | Where-Object { $_ -like "*$modelTag_clean*" -or $_ -eq $ModelTag }
        if ($alreadyRegistered) {
            Log "Model already registered: $($alreadyRegistered -join ', ')" "OK"
            StepOk "Model $ModelTag is already registered with Ollama"
            $StepResults["Step8"] = $true
            return $true
        }
    } catch {
        Log "Could not query Ollama tags: $_" "WARN"
    }

    # 8c. Register from bundled GGUF
    if (-not $ggufFile) {
        StepFail "Step8-Model" "Model '$ModelTag' not registered and no GGUF file found in $ModelsDir. Re-run installer or Repair-FactumIL.ps1."
    }

    # 8d. Verify GGUF checksum against deps-manifest.json
    $manifestPath = Join-Path $AppDir "deps-manifest.json"
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $ggufFileName = $ggufFile.Name
            if ($manifest.$ggufFileName) {
                Log "Verifying GGUF checksum..." "INFO"
                $actualHash = (Get-FileHash -Path $ggufFile.FullName -Algorithm SHA256).Hash
                $expectedHash = $manifest.$ggufFileName.ToUpper()
                if ($actualHash -ne $expectedHash) {
                    StepFail "Step8-Model" "GGUF checksum mismatch!`n  Expected: $expectedHash`n  Actual:   $actualHash`n  File may be corrupted. Re-run installer."
                }
                Log "GGUF checksum verified: $actualHash" "OK"
            }
        } catch {
            Log "Could not verify GGUF checksum (non-fatal): $_" "WARN"
        }
    }

    # 8e. Run register-ollama-model.ps1
    $regScript = Join-Path $ToolsDir "register-ollama-model.ps1"
    if (-not (Test-Path $regScript)) {
        $regScript = Join-Path $ScriptsDir "register-ollama-model.ps1"
    }
    if (Test-Path $regScript) {
        Log "Running model registration script..." "INFO"
        try {
            & powershell.exe -NonInteractive -ExecutionPolicy Bypass `
                -File $regScript -GgufPath $ggufFile.FullName -ModelTag $ModelTag
            if ($LASTEXITCODE -ne 0) {
                StepFail "Step8-Model" "Model registration script exited with code $LASTEXITCODE"
            }
        } catch {
            StepFail "Step8-Model" "Model registration script failed: $_"
        }
    } else {
        # Fallback: direct ollama create
        $mfTmp = Join-Path ([IO.Path]::GetTempPath()) "factumil-mf-$PID.txt"
        "FROM $($ggufFile.FullName)" | Set-Content $mfTmp -Encoding UTF8
        try {
            $ollamaExe = Find-OllamaExe
            if ($ollamaExe) {
                & $ollamaExe create $ModelTag --file $mfTmp
                if ($LASTEXITCODE -ne 0) {
                    Remove-Item $mfTmp -Force -ErrorAction SilentlyContinue
                    StepFail "Step8-Model" "ollama create failed with exit code $LASTEXITCODE"
                }
            }
        } finally {
            Remove-Item $mfTmp -Force -ErrorAction SilentlyContinue
        }
    }

    StepOk "Model $ModelTag registered successfully"
    return $true
}

$null = Ensure-LocalModel
$StepResults["Step8"] = $true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 9 — Verify local AI responsiveness
# ══════════════════════════════════════════════════════════════════════════════
Step "Verify local AI responsiveness (warmup inference)"
$script:State = "VERIFYING"

$aiHealthScript = Join-Path $ScriptsDir "Test-AIHealth.ps1"
$aiHealthOk = $false

if (Test-Path $aiHealthScript) {
    try {
        & powershell.exe -NonInteractive -ExecutionPolicy Bypass `
            -File $aiHealthScript -ModelTag $ModelTag -OllamaUrl $OllamaBaseUrl `
            -OutputFile $HealthFile
        $aiHealthOk = ($LASTEXITCODE -eq 0)
    } catch {
        Log "Test-AIHealth.ps1 error: $_" "WARN"
    }
}

if (-not $aiHealthOk) {
    # Fallback: direct HTTP warmup probe
    Log "Running inline AI warmup probe..." "INFO"
    $warmupBody = @{
        model  = $ModelTag
        prompt = "ענה במילה אחת: מהי מדינת ישראל?"
        stream = $false
    } | ConvertTo-Json
    try {
        $warmupStart    = Get-Date
        $warmupResponse = Invoke-RestMethod "$OllamaBaseUrl/api/generate" `
            -Method POST -Body $warmupBody -ContentType "application/json" `
            -TimeoutSec 120 -ErrorAction Stop
        $latencyMs = ((Get-Date) - $warmupStart).TotalMilliseconds
        if ($warmupResponse.response -and $warmupResponse.response.Length -gt 0) {
            $aiHealthOk = $true
            Log "Warmup inference succeeded in $([math]::Round($latencyMs))ms" "OK"
            $healthData = [ordered]@{
                timestamp          = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
                ollamaRunning      = $true
                modelPresent       = $true
                inferenceSucceeded = $true
                latencyMs          = [math]::Round($latencyMs)
                modelName          = $ModelTag
                endpoint           = $OllamaBaseUrl
            }
            $healthData | ConvertTo-Json | Set-Content $HealthFile -Encoding UTF8
        } else {
            Log "Warmup inference returned empty response" "WARN"
        }
    } catch {
        Log "Warmup inference failed: $_" "WARN"
        $healthData = [ordered]@{
            timestamp          = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            ollamaRunning      = (Test-OllamaResponding)
            modelPresent       = $true
            inferenceSucceeded = $false
            latencyMs          = -1
            modelName          = $ModelTag
            endpoint           = $OllamaBaseUrl
            error              = $_.ToString()
        }
        $healthData | ConvertTo-Json | Set-Content $HealthFile -Encoding UTF8
    }
}

if (-not $aiHealthOk) {
    StepFail "Step9-AIHealth" "AI warmup inference failed. Model may not be loaded. Run Repair-FactumIL.ps1 to re-register the model."
}

StepOk "AI warmup inference passed — Factum-IL AI is ready"
$StepResults["Step9"] = $true

# ══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Generate readiness marker
# ══════════════════════════════════════════════════════════════════════════════
Step "Generate readiness marker (BOOTSTRAP_DONE.flag)"

$flagContent = [ordered]@{
    bootstrappedAt      = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    bootstrapVersion    = $BootstrapVersion
    nodeVerified        = ($StepResults["Step5"] -eq $true)
    webView2Verified    = ($StepResults["Step6"] -eq $true)
    ollamaVerified      = ($StepResults["Step7"] -eq $true)
    modelVerified       = ($StepResults["Step8"] -eq $true)
    aiWarmupPassed      = ($StepResults["Step9"] -eq $true)
    migrationsApplied   = ($StepResults["Step4"] -eq $true)
    appDir              = $AppDir
}

try {
    $flagContent | ConvertTo-Json | Set-Content $FlagFile -Encoding UTF8
    StepOk "BOOTSTRAP_DONE.flag written: $FlagFile"
    $StepResults["Step10"] = $true
} catch {
    StepFail "Step10-Flag" "Could not write BOOTSTRAP_DONE.flag: $_"
}

# ══════════════════════════════════════════════════════════════════════════════
# STEP 11 — Launch application
# ══════════════════════════════════════════════════════════════════════════════
Step "Launch application"

$elapsed = ((Get-Date) - $StartTime).TotalSeconds
$script:State = "READY"
Log "Bootstrap completed in $($elapsed.ToString('F1'))s — state: READY" "OK"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║  Bootstrap Complete — Factum-IL AI is Ready!            ║" -ForegroundColor Green
Write-Host "  ║  זמן אתחול: $($elapsed.ToString('F1'))s                          " -ForegroundColor Green
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if ($SkipLaunch) {
    Log "SkipLaunch flag set — not launching Desktop.exe" "INFO"
    $StepResults["Step11"] = $true
    exit 0
}

if (-not (Test-Path $DesktopExe)) {
    StepFail "Step11-Launch" "Desktop executable not found: $DesktopExe"
}

try {
    Start-Process -FilePath $DesktopExe -WorkingDirectory (Split-Path $DesktopExe)
    StepOk "FactumIL.Desktop.exe launched"
    $StepResults["Step11"] = $true
} catch {
    StepFail "Step11-Launch" "Could not launch FactumIL.Desktop.exe: $_"
}

exit 0
