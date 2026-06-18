#Requires -Version 5.1
<#
.SYNOPSIS
    Factum-IL — Local AI Health Check Framework

.DESCRIPTION
    Verifies that the local Ollama instance is running, the required model is present,
    and that inference succeeds within an acceptable latency threshold.

    Writes runtime\AI_HEALTH.json for the desktop application to read at startup.
    If AI is unhealthy, the application must enter MAINTENANCE state — never silently
    downgrade to an external provider.

    LOCAL-ONLY POLICY: Any failure causes MAINTENANCE mode. Cloud fallback is forbidden.

.PARAMETER ModelTag
    Ollama model tag to verify. MUST be BrainboxAI/law-il-E2B:Q4_K_M.

.PARAMETER OllamaUrl
    Ollama base URL. Default: http://127.0.0.1:11434

.PARAMETER OutputFile
    Path to write AI_HEALTH.json. Default: {script-dir}\..\..\runtime\AI_HEALTH.json

.PARAMETER MaxLatencyMs
    Maximum acceptable warmup inference latency in milliseconds. Default: 120000 (2 min).

.EXAMPLE
    .\Test-AIHealth.ps1
    .\Test-AIHealth.ps1 -ModelTag "BrainboxAI/law-il-E2B:Q4_K_M" -OutputFile "C:\FactumIL\runtime\AI_HEALTH.json"
#>
[CmdletBinding()]
param(
    [string] $ModelTag    = "BrainboxAI/law-il-E2B:Q4_K_M",
    [string] $OllamaUrl   = "http://127.0.0.1:11434",
    [string] $OutputFile  = "",
    [int]    $MaxLatencyMs = 120000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# Enforce: ONLY BrainboxAI/law-il-E2B:Q4_K_M is permitted
if ($ModelTag -ne "BrainboxAI/law-il-E2B:Q4_K_M") {
    Write-Error "POLICY VIOLATION: Only 'BrainboxAI/law-il-E2B:Q4_K_M' is permitted. Provided: '$ModelTag'"
    exit 1
}

# Enforce: Only loopback endpoint is permitted
if ($OllamaUrl -notmatch '^https?://(127\.0\.0\.1|localhost)(:\d+)?') {
    Write-Error "POLICY VIOLATION: Only localhost Ollama endpoint is permitted. Provided: '$OllamaUrl'"
    exit 1
}

# Resolve output file
if (-not $OutputFile) {
    $scriptDir  = $PSScriptRoot
    $runtimeDir = Join-Path (Resolve-Path (Join-Path $scriptDir '..\..')).Path "runtime"
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $OutputFile = Join-Path $runtimeDir "AI_HEALTH.json"
}

$result = [ordered]@{
    timestamp          = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    ollamaRunning      = $false
    modelPresent       = $false
    inferenceSucceeded = $false
    latencyMs          = -1
    modelName          = $ModelTag
    endpoint           = $OllamaUrl
    error              = $null
    policyCompliant    = $true
}

function Write-Health([string]$msg, [string]$level = "INFO") {
    $ts   = (Get-Date).ToString("HH:mm:ss")
    $color = switch ($level) {
        "OK"    { "Green"  }
        "WARN"  { "Yellow" }
        "ERROR" { "Red"    }
        default { "Gray"   }
    }
    Write-Host "  [$ts][$level] $msg" -ForegroundColor $color
}

Write-Host ""
Write-Host "  ── Factum-IL AI Health Check ──────────────────────────────" -ForegroundColor Cyan
Write-Host "  Model:    $ModelTag" -ForegroundColor Gray
Write-Host "  Endpoint: $OllamaUrl" -ForegroundColor Gray
Write-Host ""

# ── CHECK 1: Ollama running ────────────────────────────────────────────────────
Write-Health "Checking Ollama service..."
try {
    $tagsResp = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 10 -ErrorAction Stop
    $result.ollamaRunning = $true
    Write-Health "Ollama service is running at $OllamaUrl" "OK"
} catch {
    $result.error = "Ollama not responding: $_"
    Write-Health "Ollama service is NOT running: $_" "ERROR"
    $result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8
    Write-Host ""
    Write-Host "  [MAINTENANCE MODE] AI is unavailable. Run Repair-FactumIL.ps1." -ForegroundColor Red
    exit 1
}

# ── CHECK 2: Model present ────────────────────────────────────────────────────
Write-Health "Checking model presence..."
try {
    $modelNames    = $tagsResp.models | ForEach-Object { $_.name }
    $searchTag     = ($ModelTag -replace ":Q4_K_M$","").ToLower()
    $modelFound    = $modelNames | Where-Object { $_.ToLower() -like "*$searchTag*" -or $_ -eq $ModelTag }
    if ($modelFound) {
        $result.modelPresent = $true
        Write-Health "Model present: $($modelFound -join ', ')" "OK"
    } else {
        $result.error = "Model '$ModelTag' not found. Registered models: $($modelNames -join ', ')"
        Write-Health "Model '$ModelTag' NOT found in Ollama registry" "ERROR"
        Write-Health "Available models: $($modelNames -join ', ')" "WARN"
        $result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8
        exit 1
    }
} catch {
    $result.error = "Cannot query Ollama model list: $_"
    Write-Health "Cannot query model list: $_" "ERROR"
    $result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8
    exit 1
}

# ── CHECK 3: Inference succeeds ───────────────────────────────────────────────
Write-Health "Running warmup inference (this may take 1-3 minutes)..."
$warmupPrompt = @{
    model  = $ModelTag
    prompt = "ענה במילה אחת בלבד: מהי עיר הבירה של מדינת ישראל?"
    stream = $false
    options = @{ num_predict = 10; temperature = 0.0 }
} | ConvertTo-Json

$inferenceStart = Get-Date
try {
    $inferenceResp = Invoke-RestMethod "$OllamaUrl/api/generate" `
        -Method POST -Body $warmupPrompt -ContentType "application/json; charset=utf-8" `
        -TimeoutSec ($MaxLatencyMs / 1000) -ErrorAction Stop
    $latencyMs = ((Get-Date) - $inferenceStart).TotalMilliseconds
    $result.latencyMs = [math]::Round($latencyMs)

    if ($inferenceResp.response -and $inferenceResp.response.Trim().Length -gt 0) {
        $result.inferenceSucceeded = $true
        $preview = $inferenceResp.response.Trim().Substring(0, [math]::Min(50, $inferenceResp.response.Trim().Length))
        Write-Health "Inference succeeded in $($result.latencyMs)ms. Response: '$preview'" "OK"

        if ($latencyMs -gt $MaxLatencyMs) {
            Write-Health "WARNING: Latency $($result.latencyMs)ms exceeds threshold ${MaxLatencyMs}ms" "WARN"
        }
    } else {
        $result.error = "Inference returned empty response"
        Write-Health "Inference returned empty response" "ERROR"
        $result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8
        exit 1
    }
} catch {
    $latencyMs = ((Get-Date) - $inferenceStart).TotalMilliseconds
    $result.latencyMs = [math]::Round($latencyMs)
    $result.error     = "Inference failed: $_"
    Write-Health "Inference FAILED after $($result.latencyMs)ms: $_" "ERROR"
    $result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8
    Write-Host ""
    Write-Host "  [MAINTENANCE MODE] AI inference failed. Run Repair-FactumIL.ps1." -ForegroundColor Red
    exit 1
}

# ── Write health report ────────────────────────────────────────────────────────
$result | ConvertTo-Json | Set-Content $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "  ── AI Health Summary ──────────────────────────────────────" -ForegroundColor Cyan
Write-Host "  Ollama running:       $($result.ollamaRunning)" -ForegroundColor $(if ($result.ollamaRunning) { 'Green' } else { 'Red' })
Write-Host "  Model present:        $($result.modelPresent)" -ForegroundColor $(if ($result.modelPresent) { 'Green' } else { 'Red' })
Write-Host "  Inference succeeded:  $($result.inferenceSucceeded)" -ForegroundColor $(if ($result.inferenceSucceeded) { 'Green' } else { 'Red' })
Write-Host "  Latency:              $($result.latencyMs)ms" -ForegroundColor Gray
Write-Host "  Policy compliant:     $($result.policyCompliant)" -ForegroundColor Green
Write-Host "  Report written:       $OutputFile" -ForegroundColor Gray
Write-Host ""

if ($result.ollamaRunning -and $result.modelPresent -and $result.inferenceSucceeded) {
    Write-Host "  [OK] AI is healthy — Factum-IL may launch." -ForegroundColor Green
    exit 0
} else {
    Write-Host "  [MAINTENANCE] AI is NOT healthy — application must show maintenance mode." -ForegroundColor Red
    Write-Host "  IMPORTANT: Do NOT fall back to external AI providers." -ForegroundColor Red
    exit 1
}
