#Requires -Version 5.1
<#
.SYNOPSIS
    Legal-OS File Watcher — monitors WatchFolders and POSTs new files to the ingest API.

.DESCRIPTION
    Uses .NET FileSystemWatcher to monitor the configured watch folders.
    When a new file is created or renamed into the folder, it calls
    POST http://localhost:3001/api/media/ingest with the file path.

    Excluded by the data firewall: סיעוד, רפואה, Nursing, Medical paths.
    Only processes: .pdf, .docx, .doc, .jpg, .jpeg, .png, .heic, .tiff, .webp

.PARAMETER ApiBase
    Base URL of the Legal-OS API (default: http://localhost:3001)

.PARAMETER DebounceSec
    Seconds to debounce rapid file-system events (default: 3)
#>
param(
    [string]$ApiBase    = 'http://localhost:3001',
    [int]   $DebounceSec = 3
)

# Load branded config if available
$configPath = Join-Path $PSScriptRoot '..\lib\Config.ps1'
if (Test-Path $configPath) { . $configPath }

$WatchFolders = if ($Script:WatchFolders) { $Script:WatchFolders } else {
    @([System.IO.Path]::Combine($env:USERPROFILE, 'Downloads'),
      [System.IO.Path]::Combine($env:USERPROFILE, 'Documents'))
}

$ALLOWED_EXTENSIONS = @('.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.heic', '.tiff', '.webp')
$EXCLUDED_PATTERNS  = @('סיעוד', 'רפואה', 'Nursing', 'Medical', 'node_modules', '\.git')

function Test-Excluded([string]$Path) {
    foreach ($pattern in $EXCLUDED_PATTERNS) {
        if ($Path -match $pattern) { return $true }
    }
    return $false
}

function Invoke-Ingest([string]$FilePath) {
    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
    if ($ALLOWED_EXTENSIONS -notcontains $ext) { return }
    if (Test-Excluded $FilePath) {
        Write-Host "[Watcher] חסום על ידי חומת האש: $FilePath" -ForegroundColor DarkYellow
        return
    }

    $body = @{ filePath = $FilePath } | ConvertTo-Json -Compress
    try {
        $response = Invoke-RestMethod `
            -Uri         "$ApiBase/api/media/ingest" `
            -Method      POST `
            -Body        $body `
            -ContentType 'application/json' `
            -TimeoutSec  30

        $status = $response.data.status
        Write-Host "[Watcher] $status — $FilePath" -ForegroundColor Cyan
    } catch {
        Write-Host "[Watcher] שגיאה בעיבוד קובץ: $FilePath — $_" -ForegroundColor Red
    }
}

# ── Debounce table ────────────────────────────────────────────────────────────
$debounce = [System.Collections.Generic.Dictionary[string,datetime]]::new()

$handler = {
    param($source, $event)
    $path = $event.FullPath
    $now  = [datetime]::UtcNow

    # Debounce: skip if processed within DebounceSec seconds
    if ($debounce.ContainsKey($path) -and ($now - $debounce[$path]).TotalSeconds -lt $DebounceSec) {
        return
    }
    $debounce[$path] = $now

    # Run ingest in a thread job so the watcher isn't blocked
    Start-ThreadJob -ScriptBlock {
        param($fp, $api)
        # Brief wait to ensure file is fully written
        Start-Sleep -Milliseconds 500
        if (-not (Test-Path $fp)) { return }
        $body = @{ filePath = $fp } | ConvertTo-Json -Compress
        try {
            Invoke-RestMethod -Uri "$api/api/media/ingest" -Method POST -Body $body -ContentType 'application/json' | Out-Null
        } catch {}
    } -ArgumentList $path, $ApiBase | Out-Null
}

# ── Create watchers ───────────────────────────────────────────────────────────
$watchers = @()
foreach ($folder in $WatchFolders) {
    if (-not (Test-Path $folder)) {
        Write-Host "[Watcher] תיקייה לא קיימת, מדלג: $folder" -ForegroundColor DarkYellow
        continue
    }

    $watcher                    = New-Object System.IO.FileSystemWatcher $folder
    $watcher.IncludeSubdirectories = $true
    $watcher.EnableRaisingEvents   = $true
    $watcher.NotifyFilter          = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::LastWrite

    Register-ObjectEvent $watcher 'Created' -Action $handler | Out-Null
    Register-ObjectEvent $watcher 'Renamed' -Action $handler | Out-Null

    $watchers += $watcher
    Write-Host "[Watcher] מנטר: $folder" -ForegroundColor Green
}

Write-Host "[Watcher] Legal-OS File Watcher פעיל — לעצור לחץ Ctrl+C" -ForegroundColor Green

try {
    while ($true) { Start-Sleep -Seconds 5 }
} finally {
    foreach ($w in $watchers) { $w.Dispose() }
    Write-Host "[Watcher] עצר." -ForegroundColor Yellow
}
