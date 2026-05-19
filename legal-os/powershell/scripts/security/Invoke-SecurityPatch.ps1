#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Channel 1 — Security patch runner for Factum IL.
  Runs winget upgrade and pnpm audit --fix, then logs the result.
#>

param(
  [string]$ApiBaseUrl = "http://localhost:3001/api"
)

$ErrorActionPreference = "Continue"

function Write-PatchLog {
  param([string]$Message, [string]$Level = "INFO")
  $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
  Write-Host "[$ts][$Level] $Message"
}

$details = @()
$errors  = @()
$status  = "success"

# ── Channel 1a: winget upgrade ──────────────────────────────────
Write-PatchLog "Starting winget upgrade --all"
try {
  $wingetResult = & winget upgrade --all --silent --accept-package-agreements --accept-source-agreements 2>&1
  $details += @{ step = "winget"; output = ($wingetResult | Select-Object -Last 5) -join "`n" }
  Write-PatchLog "winget upgrade completed"
} catch {
  $errors  += "winget: $_"
  $status   = "failed"
  Write-PatchLog "winget upgrade failed: $_" "WARN"
}

# ── Channel 1b: pnpm audit ──────────────────────────────────────
Write-PatchLog "Running pnpm audit --fix"
try {
  $factumIlRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  Push-Location $factumIlRoot
  $auditResult = & pnpm audit --fix 2>&1
  $details += @{ step = "pnpm_audit"; output = ($auditResult | Select-Object -Last 10) -join "`n" }
  Write-PatchLog "pnpm audit completed"
  Pop-Location
} catch {
  $errors  += "pnpm_audit: $_"
  $status   = if ($status -eq "success") { "failed" } else { $status }
  Write-PatchLog "pnpm audit failed: $_" "WARN"
}

# ── Log to API ──────────────────────────────────────────────────
$payload = @{
  channel = "security"
  status  = $status
  details = $details
} | ConvertTo-Json -Depth 5

try {
  Invoke-RestMethod -Uri "$ApiBaseUrl/updates/log" `
    -Method POST `
    -ContentType "application/json" `
    -Body $payload `
    -TimeoutSec 10 | Out-Null
  Write-PatchLog "Update logged to API"
} catch {
  Write-PatchLog "Could not log update to API (server may not be running): $_" "WARN"
}

if ($errors.Count -gt 0) {
  Write-PatchLog "Security patch completed with errors: $($errors -join '; ')" "WARN"
  exit 1
} else {
  Write-PatchLog "Security patch completed successfully"
  exit 0
}
