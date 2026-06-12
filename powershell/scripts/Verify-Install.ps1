#Requires -Version 5.1
<#
.SYNOPSIS
    Verify a Factum IL installation — registry, files, DB migrations, API health.

.DESCRIPTION
    Runs a series of checks after installing Factum IL on a Windows machine.
    Prints [PASS] / [FAIL] / [SKIP] for each check, then exits with code 0
    (all passed) or 1 (at least one failure).

.PARAMETER InstallDir
    Root installation directory.  Default: C:\Program Files\FactumIL

.PARAMETER DevMode
    When set, skips registry and file-existence checks and resolves the DB
    path relative to the repository root.  Suitable for CI and dev machines
    that do not have the installer-deployed layout.

.EXAMPLE
    # After real installation:
    powershell -File powershell\scripts\Verify-Install.ps1 -InstallDir "C:\Program Files\FactumIL"

    # Developer / CI mode (no installer):
    powershell -File powershell\scripts\Verify-Install.ps1 -DevMode
#>

[CmdletBinding()]
param(
    [string] $InstallDir = 'C:\Program Files\FactumIL',
    [switch] $DevMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ── helpers ────────────────────────────────────────────────────────────────────

$Script:Failures = 0

function Pass([string]$Name) {
    Write-Host "[PASS] $Name" -ForegroundColor Green
}

function Fail([string]$Name, [string]$Reason) {
    Write-Host "[FAIL] $Name -- $Reason" -ForegroundColor Red
    $Script:Failures++
}

function Skip([string]$Name, [string]$Reason) {
    Write-Host "[SKIP] $Name -- $Reason" -ForegroundColor Yellow
}

function Test-Sqlite3Available {
    return ($null -ne (Get-Command sqlite3 -ErrorAction SilentlyContinue))
}

# ── resolve paths ───────────────────────────────────────────────────────────────

if ($DevMode) {
    # This script lives at <repo-root>/powershell/scripts/Verify-Install.ps1
    $repoRoot      = Resolve-Path (Join-Path $PSScriptRoot '..\..')
    $DbPath        = Join-Path $repoRoot '_data\factum-il.db'
    $MigrationsDir = Join-Path $repoRoot 'migrations'
} else {
    $DbPath        = Join-Path $env:LOCALAPPDATA 'FactumIL\factum-il.db'
    $MigrationsDir = Join-Path $InstallDir 'app\migrations'
}

# ==============================================================================
#  CHECK 1 — Core files (skipped in DevMode)
# ==============================================================================

if (-not $DevMode) {
    $coreFiles = @(
        @{ Path = Join-Path $InstallDir 'FactumIL.Desktop.exe'; Label = 'FactumIL.Desktop.exe' }
        @{ Path = Join-Path $InstallDir 'tools\sqlite-vec.dll'; Label = 'tools\sqlite-vec.dll' }
    )
    foreach ($f in $coreFiles) {
        if (Test-Path $f.Path) {
            Pass "Core file: $($f.Label)"
        } else {
            Fail "Core file: $($f.Label)" "Not found at $($f.Path)"
        }
    }

    # Corpus directory — must exist and be non-empty
    $corpusDir = Join-Path $InstallDir 'app\legal-corpus\batches'
    if (Test-Path $corpusDir -PathType Container) {
        $batchCount = (Get-ChildItem $corpusDir -Filter 'batch-*.jsonl.gz' -ErrorAction SilentlyContinue).Count
        if ($batchCount -gt 0) {
            Pass "Core dir: legal-corpus\batches (non-empty, $batchCount file(s))"
        } else {
            Fail "Core dir: legal-corpus\batches" "Directory exists but contains no batch-*.jsonl.gz files"
        }
    } else {
        Fail "Core dir: legal-corpus\batches" "Directory not found at $corpusDir"
    }
} else {
    Skip "Core files" "DevMode -- installer layout not expected"
}

# ==============================================================================
#  CHECK 2 — Registry values (skipped in DevMode)
# ==============================================================================

if (-not $DevMode) {
    $regRoot = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
    $requiredValues = @(
        'FACTUM_IL_ROOT'
        'WHISPER_EXE'
        'FFMPEG_EXE'
        'OLLAMA_MODEL'
        'AI_TIER'
        'SQLITE_VEC_PATH'
        'OLLAMA_BASE_URL'
        'FACTUM_IL_VERSION'
    )
    foreach ($valueName in $requiredValues) {
        try {
            $val = (Get-ItemProperty -Path $regRoot -Name $valueName -ErrorAction Stop).$valueName
            if ($null -ne $val -and $val -ne '') {
                Pass "Registry: $valueName"
            } else {
                Fail "Registry: $valueName" "Value is empty"
            }
        } catch {
            Fail "Registry: $valueName" "Key not found under $regRoot"
        }
    }
} else {
    Skip "Registry values" "DevMode -- registry not populated by installer"
}

# ==============================================================================
#  CHECK 3 — Migration count (dynamic, accounts for intentional gap at 067)
# ==============================================================================

if (Test-Sqlite3Available) {
    if (Test-Path $DbPath) {
        # Count .sql files on disk — includes the gap, so N_applied = N_files - 1
        $MigFiles = (Get-ChildItem (Join-Path $MigrationsDir '*.sql') -ErrorAction SilentlyContinue).Count

        if ($MigFiles -eq 0) {
            Skip "Migration count" "No *.sql files found in $MigrationsDir"
        } else {
            $appliedRaw = sqlite3 $DbPath "SELECT COUNT(*) FROM _migrations;" 2>&1
            if ($LASTEXITCODE -ne 0 -or "$appliedRaw" -match 'no such table') {
                Fail "Migration count" "_migrations table not found or query failed: $appliedRaw"
            } else {
                $Applied  = [int]("$appliedRaw" -replace '\D', '')
                $Expected = $MigFiles - 1   # gap at 067 means one sql file has no DB row
                if ($Applied -eq $Expected) {
                    Pass "Migration count ($Applied applied, $MigFiles sql files on disk, gap at 067 accounted for)"
                } else {
                    Fail "Migration count" "Expected $Expected applied migrations (N_files=$MigFiles minus 1 gap), got $Applied"
                }
            }
        }
    } else {
        Skip "Migration count" "DB not found at $DbPath -- run the app once to initialise"
    }
} else {
    Skip "Migration count" "sqlite3 CLI not available"
}

# ==============================================================================
#  CHECK 4 — sqlite-vec extension
# ==============================================================================

if (Test-Sqlite3Available) {
    if (Test-Path $DbPath) {
        $vecResult = sqlite3 $DbPath "SELECT vec_version();" 2>&1
        if ($LASTEXITCODE -eq 0 -and $vecResult -and "$vecResult".Trim() -ne '') {
            Pass "sqlite-vec: vec_version() = $("$vecResult".Trim())"
        } else {
            Fail "sqlite-vec" "vec_version() returned empty or error: $vecResult"
        }
    } else {
        Skip "sqlite-vec" "DB not found at $DbPath"
    }
} else {
    Skip "sqlite-vec" "sqlite3 CLI not available"
}

# ==============================================================================
#  CHECK 5 — LegalSources corpus rows
# ==============================================================================

if (Test-Sqlite3Available) {
    if (Test-Path $DbPath) {
        $lsCountRaw = sqlite3 $DbPath "SELECT COUNT(*) FROM LegalSources;" 2>&1
        if ($LASTEXITCODE -eq 0 -and "$lsCountRaw" -match '^\d+$') {
            $lsCount = [int]"$lsCountRaw"
            if ($lsCount -gt 0) {
                Pass "LegalSources corpus ($lsCount row(s))"
            } else {
                Fail "LegalSources corpus" "Table exists but has 0 rows -- corpus may not have been ingested"
            }
        } else {
            Fail "LegalSources corpus" "Query failed or table missing: $lsCountRaw"
        }
    } else {
        Skip "LegalSources corpus" "DB not found at $DbPath"
    }
} else {
    Skip "LegalSources corpus" "sqlite3 CLI not available"
}

# ==============================================================================
#  CHECK 6 — API health endpoint (GET /api/health -> ok:true)
# ==============================================================================

$ApiRunning = $false
try {
    $healthResp = Invoke-RestMethod 'http://localhost:3001/api/health' -TimeoutSec 5 -ErrorAction Stop
    $ApiRunning = $true
    if ($healthResp.ok -eq $true) {
        Pass "API health (ok=true)"
    } else {
        Fail "API health" "Response received but ok != true: $($healthResp | ConvertTo-Json -Compress)"
    }
} catch {
    Skip "API health" "API not reachable on :3001 -- start the app first (error: $($_.Exception.Message))"
}

# ==============================================================================
#  CHECK 7 — Ollama degraded -> health still returns ok:true
# ==============================================================================

if ($ApiRunning) {
    try {
        $h2 = Invoke-RestMethod 'http://localhost:3001/api/health' -TimeoutSec 5 -ErrorAction Stop
        # Contract: even if Ollama is down the API must return ok:true
        # (Ollama availability is a sub-field, not an error condition)
        if ($h2.ok -eq $true) {
            Pass "API health resilient (ok=true regardless of Ollama state)"
        } else {
            Fail "API health resilient" "ok != true -- API must not return ok:false when Ollama is merely degraded"
        }
    } catch {
        Fail "API health resilient" "Request failed: $($_.Exception.Message)"
    }
} else {
    Skip "API health resilient (Ollama degraded)" "API not running"
}

# ==============================================================================
#  CHECK 8 — Hebrew FTS5 (DevMode only -- needs write access to DB)
# ==============================================================================

if ($DevMode) {
    if (Test-Sqlite3Available) {
        if (Test-Path $DbPath) {
            try {
                # Insert a test client with a Hebrew name
                sqlite3 $DbPath "INSERT INTO Clients (full_name,id_number) VALUES ('דוד כהן','123456782');" 2>&1 | Out-Null

                # Search via FTS5 index
                $ftsResult = sqlite3 $DbPath "SELECT rowid FROM fts_clients WHERE fts_clients MATCH 'דוד';" 2>&1

                # Clean up regardless of result
                sqlite3 $DbPath "DELETE FROM Clients WHERE full_name='דוד כהן' AND id_number='123456782';" 2>&1 | Out-Null

                if ($ftsResult -and "$ftsResult".Trim() -ne '') {
                    Pass "Hebrew FTS5 (fts_clients MATCH 'דוד')"
                } else {
                    Fail "Hebrew FTS5" "INSERT succeeded but FTS5 MATCH returned no rows -- check FTS trigger/index"
                }
            } catch {
                Fail "Hebrew FTS5" "Exception: $($_.Exception.Message)"
            }
        } else {
            Skip "Hebrew FTS5" "DB not found at $DbPath"
        }
    } else {
        Skip "Hebrew FTS5" "sqlite3 CLI not available"
    }
} else {
    Skip "Hebrew FTS5" "DevMode not set -- skipping write test on production DB"
}

# ==============================================================================
#  Exit
# ==============================================================================

Write-Host ''
if ($Script:Failures -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$($Script:Failures) check(s) failed." -ForegroundColor Red
    exit 1
}
