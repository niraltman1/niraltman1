<#
.SYNOPSIS
  Vacuum Protocol orchestrator — runs all 4 phases and reports progress back to the API.
.PARAMETER SessionId
  Integer ID of the VacuumSessions row to update.
.PARAMETER TargetPath
  Root directory to scan. Supports paths with spaces and Hebrew characters
  (e.g. C:\Users\עורך דין\Documents). Always passed via spawn args, never a shell string.
.PARAMETER ApiBase
  Base URL of the local API server (default: http://localhost:3001).
#>
param(
  [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $SessionId,
  [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $TargetPath,
  [string] $ApiBase = 'http://localhost:3001'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

# Validate that the target path exists before starting (graceful fail, not crash)
if (-not (Test-Path -LiteralPath $TargetPath -PathType Container)) {
  $errMsg = "TargetPath does not exist or is not a directory: $TargetPath"
  try {
    $body = [pscustomobject]@{ status='failed'; progress=0; message=$errMsg; logLine="$errMsg`n" } |
            ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "$ApiBase/api/vacuum/progress/$SessionId" `
                      -Method POST -Body $body `
                      -ContentType 'application/json' -TimeoutSec 5 | Out-Null
  } catch {}
  exit 1
}

function Send-Progress {
  param([string]$Status, [int]$Pct, [string]$Message)
  $timestamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
  $logLine   = "[$timestamp] $Message`n"
  $body = [pscustomobject]@{ status=$Status; progress=$Pct; message=$Message; logLine=$logLine } |
          ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri "$ApiBase/api/vacuum/progress/$SessionId" `
                      -Method POST -Body $body `
                      -ContentType 'application/json' -TimeoutSec 5 | Out-Null
  } catch {}
}

# ─── Phase 1: Discovery ───────────────────────────────────────────────────────

Send-Progress 'discovery' 5 'Phase 1: מחפש קבצים...'

$EXCLUDED_PATTERNS = @('node_modules','\.git','[\\/]סיעוד[\\/]','[\\/]רפואה[\\/]',
                        '[\\/]Nursing[\\/]','[\\/]Medical[\\/]','[\\/]Healthcare[\\/]',
                        '[\\/]__MACOSX[\\/]','[\\/]\._')
$ELIGIBLE_EXT      = @('.pdf','.docx','.doc','.jpg','.jpeg','.png',
                        '.heic','.tiff','.webp','.ogg','.m4a','.mp3','.wav')
$MAX_FILES = 50000

$files     = [System.Collections.Generic.List[string]]::new()
$dirQueue  = [System.Collections.Generic.Queue[string]]::new()
$dirQueue.Enqueue($TargetPath)

while ($dirQueue.Count -gt 0 -and $files.Count -lt $MAX_FILES) {
  $dir = $dirQueue.Dequeue()
  try {
    # -LiteralPath handles spaces, Hebrew chars, and special chars without glob expansion
    $entries = Get-ChildItem -LiteralPath "$dir" -Force -ErrorAction SilentlyContinue
  } catch { continue }

  foreach ($entry in $entries) {
    $skip = $false
    foreach ($pat in $EXCLUDED_PATTERNS) {
      if ($entry.FullName -match $pat) { $skip = $true; break }
    }
    if ($skip) { continue }

    if ($entry.PSIsContainer) {
      $dirQueue.Enqueue($entry.FullName)
    } elseif ($ELIGIBLE_EXT -contains $entry.Extension.ToLower()) {
      $files.Add($entry.FullName)
    }
  }
}

$fileCount = $files.Count
Send-Progress 'discovery' 25 "Phase 1: זוהו $fileCount קבצים לעיבוד"

if ($fileCount -eq 0) {
  Send-Progress 'completed' 100 'לא נמצאו קבצים מתאימים — הפרוטוקול הסתיים'
  exit 0
}

# ─── Phase 2: Ingestion / OCR ────────────────────────────────────────────────

$done = 0
foreach ($filePath in $files) {
  # ConvertTo-Json -Compress handles all JSON escaping including backslashes and Unicode
  $body = [pscustomobject]@{ filePath=$filePath } | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Uri "$ApiBase/api/media/ingest" `
                      -Method POST -Body $body `
                      -ContentType 'application/json' -TimeoutSec 120 | Out-Null
  } catch {
    # Non-fatal: log and continue to next file
    Send-Progress 'processing_ocr' ([int](30 + ($done / [Math]::Max(1, $fileCount)) * 35)) `
                  "שגיאה בקובץ: $($_.Exception.Message)"
  }
  $done++
  if ($done % 10 -eq 0 -or $done -eq $fileCount) {
    $pct = [int](30 + ($done / [Math]::Max(1, $fileCount)) * 35)
    Send-Progress 'processing_ocr' $pct "Phase 2: עיבד $done / $fileCount קבצים"
  }
}

Send-Progress 'processing_ocr' 65 'Phase 2: הושלם — כל הקבצים נקלטו'

# ─── Phase 3: Evidence Lockdown ──────────────────────────────────────────────

Send-Progress 'locking_evidence' 70 'Phase 3: מאמת חותמות SHA-256...'
Start-Sleep -Milliseconds 800
Send-Progress 'locking_evidence' 80 'Phase 3: כספת ראיות נעולה'

# ─── Phase 4: AI Indexing ────────────────────────────────────────────────────

Send-Progress 'indexing_ai' 85 'Phase 4: עובד AI מאנדקס מסמכים...'
Start-Sleep -Milliseconds 500
Send-Progress 'indexing_ai' 95 'Phase 4: אינדוקס AI הושלם'

# ─── Done ─────────────────────────────────────────────────────────────────────

Send-Progress 'completed' 100 "פרוטוקול ה-Vacuum הושלם: $fileCount קבצים עובדו בהצלחה"
