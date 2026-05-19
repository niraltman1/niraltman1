#Requires -Version 5.1
<#
.SYNOPSIS
  FileWatcher — real-time filesystem monitoring with debounce and duplicate suppression.
  Uses .NET System.IO.FileSystemWatcher, which is available in PS 5.1+.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Script:Watchers       = [System.Collections.Generic.Dictionary[string, object]]::new()
$Script:DebounceMap    = [System.Collections.Concurrent.ConcurrentDictionary[string, datetime]]::new()
$Script:DatabasePath   = $null
$Script:DebounceMs     = 800
$Script:MinFileSizeB   = 0
$Script:OnFileReady    = $null   # ScriptBlock invoked when a file is stable

$Script:SupportedExtensions = @('.pdf', '.docx', '.doc', '.odt', '.tiff', '.tif', '.png', '.jpg', '.jpeg')

# ─────────────────────────────────────────────────────────────────────────────
#  Initialisation
# ─────────────────────────────────────────────────────────────────────────────

function Initialize-FileWatcher {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string]      $DatabasePath,
    [Parameter(Mandatory)] [scriptblock] $OnFileReady,
    [int]    $DebounceMs   = 800,
    [int]    $MinFileSizeB = 1024
  )
  $Script:DatabasePath = $DatabasePath
  $Script:DebounceMs   = $DebounceMs
  $Script:MinFileSizeB = $MinFileSizeB
  $Script:OnFileReady  = $OnFileReady
  Write-LegalLog -Level INFO -Category system -Message "FileWatcher initialised" -Data @{ debounceMs = $DebounceMs }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Start watching a directory
# ─────────────────────────────────────────────────────────────────────────────

function Start-FileWatcher {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $WatchPath,
    [switch] $Recursive
  )
  if (-not (Test-Path $WatchPath -PathType Container)) {
    throw "Watch path not found: $WatchPath"
  }
  if ($Script:Watchers.ContainsKey($WatchPath)) {
    Write-LegalLog -Level WARN -Category system -Message "Already watching: $WatchPath"
    return
  }

  $watcher = New-Object System.IO.FileSystemWatcher $WatchPath
  $watcher.IncludeSubdirectories = [bool]$Recursive
  $watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor
                          [System.IO.NotifyFilters]::LastWrite -bor
                          [System.IO.NotifyFilters]::Size

  # Event action — runs in a PS event thread
  $action = {
    param($source, $eventArgs)
    $path = $eventArgs.FullPath
    $ext  = [System.IO.Path]::GetExtension($path).ToLower()
    if ($Script:SupportedExtensions -notcontains $ext) { return }

    $debounceKey = $path
    $now         = [datetime]::UtcNow

    # Update or insert debounce entry — only process if last event was > DebounceMs ago
    $last = [datetime]::MinValue
    if ($Script:DebounceMap.TryGetValue($debounceKey, [ref]$last)) {
      if (($now - $last).TotalMilliseconds -lt $Script:DebounceMs) {
        $Script:DebounceMap[$debounceKey] = $now
        return  # still within debounce window
      }
    }
    $Script:DebounceMap[$debounceKey] = $now

    # Defer actual processing to a timer so the FS event thread returns quickly
    $timer = New-Object System.Timers.Timer $Script:DebounceMs
    $timer.AutoReset = $false
    $capturedPath    = $path
    $capturedKey     = $debounceKey
    Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action {
      $timer.Dispose()
      Invoke-OnFileStable -FilePath $capturedPath -DebounceKey $capturedKey
    } | Out-Null
    $timer.Start()
  }

  Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $action | Out-Null
  Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action {
    param($source, $eventArgs)
    # Re-fire as if the new path was just added
    $action.Invoke($source, [PSCustomObject]@{ FullPath = $eventArgs.FullPath })
  } | Out-Null

  $watcher.EnableRaisingEvents = $true
  $Script:Watchers[$WatchPath] = $watcher

  Write-LegalLog -Level INFO -Category system `
    -Message "File watcher started" -Data @{ path = $WatchPath; recursive = [bool]$Recursive }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Stop watching
# ─────────────────────────────────────────────────────────────────────────────

function Stop-FileWatcher {
  [CmdletBinding()]
  param(
    [string] $WatchPath = $null   # $null = stop all
  )
  $paths = if ($WatchPath) { @($WatchPath) } else { @($Script:Watchers.Keys) }
  foreach ($p in $paths) {
    if ($Script:Watchers.ContainsKey($p)) {
      $Script:Watchers[$p].EnableRaisingEvents = $false
      $Script:Watchers[$p].Dispose()
      $Script:Watchers.Remove($p) | Out-Null
      Write-LegalLog -Level INFO -Category system -Message "File watcher stopped" -Data @{ path = $p }
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Stability check + dispatch
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-OnFileStable {
  [CmdletBinding()]
  param(
    [string] $FilePath,
    [string] $DebounceKey
  )
  if (-not (Test-Path $FilePath -PathType Leaf)) { return }

  $fileInfo = Get-Item $FilePath -ErrorAction SilentlyContinue
  if (-not $fileInfo -or $fileInfo.Length -lt $Script:MinFileSizeB) { return }

  if (-not (Test-FileStable -FilePath $FilePath)) {
    Write-LegalLog -Level DEBUG -Category system -Message "File not yet stable, skipping" -Data @{ path = $FilePath }
    return
  }

  # Record watcher event
  $escapedPath = $FilePath -replace "'", "''"
  $sql = @"
INSERT INTO WatcherEvents (event_type, file_path, debounce_key)
VALUES ('added', '$escapedPath', '$($DebounceKey -replace "'","''")');
"@
  sqlite3 $Script:DatabasePath $sql 2>&1 | Out-Null
  $eventId = (sqlite3 $Script:DatabasePath "SELECT last_insert_rowid();" 2>&1).Trim()

  try {
    if ($Script:OnFileReady) {
      & $Script:OnFileReady -FilePath $FilePath
    }
    sqlite3 $Script:DatabasePath "UPDATE WatcherEvents SET processed=1, queued=1, processed_at=datetime('now') WHERE id=$eventId;" 2>&1 | Out-Null
  }
  catch {
    $errMsg = $_.Exception.Message -replace "'", "''"
    sqlite3 $Script:DatabasePath "UPDATE WatcherEvents SET processed=1, error_message='$errMsg', processed_at=datetime('now') WHERE id=$eventId;" 2>&1 | Out-Null
    Write-LegalLog -Level ERROR -Category system -Message "FileWatcher dispatch error" -Data @{ path = $FilePath; error = $_.Exception.Message }
  }
  finally {
    $Script:DebounceMap.TryRemove($DebounceKey, [ref]$null) | Out-Null
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  File stability check (not being written to)
# ─────────────────────────────────────────────────────────────────────────────

function Test-FileStable {
  [CmdletBinding()]
  [OutputType([bool])]
  param(
    [Parameter(Mandatory)] [string] $FilePath,
    [int] $SampleMs = 300
  )
  try {
    $size1 = (Get-Item $FilePath).Length
    Start-Sleep -Milliseconds $SampleMs
    if (-not (Test-Path $FilePath)) { return $false }
    $size2 = (Get-Item $FilePath).Length
    if ($size1 -ne $size2) { return $false }

    # Try exclusive open
    $stream = [System.IO.File]::Open($FilePath, 'Open', 'Read', 'None')
    $stream.Close()
    return $true
  }
  catch {
    return $false
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Status query
# ─────────────────────────────────────────────────────────────────────────────

function Get-WatcherStatus {
  [CmdletBinding()]
  [OutputType([hashtable])]
  param()
  return @{
    ActiveWatchers = @($Script:Watchers.Keys)
    PendingDebounce = $Script:DebounceMap.Count
  }
}

function Get-WatcherEvents {
  [CmdletBinding()]
  param(
    [int] $Limit = 100,
    [switch] $UnprocessedOnly
  )
  $filter = if ($UnprocessedOnly) { "WHERE processed = 0" } else { "" }
  $sql = "SELECT * FROM WatcherEvents $filter ORDER BY occurred_at DESC LIMIT $Limit;"
  return sqlite3 $Script:DatabasePath $sql 2>&1
}

Export-ModuleMember -Function @(
  'Initialize-FileWatcher','Start-FileWatcher','Stop-FileWatcher',
  'Test-FileStable','Get-WatcherStatus','Get-WatcherEvents'
)
