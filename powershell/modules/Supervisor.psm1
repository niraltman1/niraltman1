#Requires -Version 5.1
<#
.SYNOPSIS
  Worker Supervisor — lifecycle management, health monitoring, memory pressure control.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Script:SupervisorId    = [System.Guid]::NewGuid().ToString()
$Script:Workers         = [System.Collections.Generic.Dictionary[string, hashtable]]::new()
$Script:DatabasePath    = $null
$Script:MemoryLimitMB   = 512
$Script:HeartbeatSeconds = 10

# ─────────────────────────────────────────────────────────────────────────────
#  Initialisation
# ─────────────────────────────────────────────────────────────────────────────

function Initialize-Supervisor {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $DatabasePath,
    [int] $MemoryLimitMB   = 512,
    [int] $HeartbeatSeconds = 10
  )
  $Script:DatabasePath     = $DatabasePath
  $Script:MemoryLimitMB    = $MemoryLimitMB
  $Script:HeartbeatSeconds = $HeartbeatSeconds

  $sql = @"
INSERT OR REPLACE INTO WorkerHealth
  (worker_id, worker_type, pid, status, started_at)
VALUES
  ('$($Script:SupervisorId)', 'supervisor', $PID, 'idle', datetime('now'));
"@
  Invoke-SQLite -DatabasePath $DatabasePath -Query $sql
  Write-LegalLog -Level INFO -Category system -Message "Supervisor initialised" -Data @{ id = $Script:SupervisorId }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Worker registration
# ─────────────────────────────────────────────────────────────────────────────

function Register-Worker {
  [CmdletBinding()]
  [OutputType([string])]
  param(
    [Parameter(Mandatory)] [ValidateSet('ocr','classify','enrich','watcher')] [string] $WorkerType,
    [int]    $MaxTasks   = [int]::MaxValue,
    [double] $MaxMemoryMB = 256
  )
  $workerId = [System.Guid]::NewGuid().ToString()
  $worker   = @{
    Id           = $workerId
    Type         = $WorkerType
    Status       = 'idle'
    MemoryMB     = 0.0
    TasksCompleted = 0
    TasksFailed  = 0
    MaxTasks     = $MaxTasks
    MaxMemoryMB  = $MaxMemoryMB
    StartedAt    = [datetime]::UtcNow
    LastHeartbeat = [datetime]::UtcNow
  }
  $Script:Workers[$workerId] = $worker

  $sql = @"
INSERT OR REPLACE INTO WorkerHealth
  (worker_id, worker_type, pid, status, started_at)
VALUES
  ('$workerId', '$WorkerType', $PID, 'idle', datetime('now'));
"@
  Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
  Write-LegalLog -Level INFO -Category system -Message "Worker registered" -Data @{ id = $workerId; type = $WorkerType }
  return $workerId
}

# ─────────────────────────────────────────────────────────────────────────────
#  Heartbeat
# ─────────────────────────────────────────────────────────────────────────────

function Update-WorkerHeartbeat {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $WorkerId,
    [ValidateSet('idle','busy','stopping')] [string] $Status = 'idle',
    [string] $CurrentTask = $null
  )
  if (-not $Script:Workers.ContainsKey($WorkerId)) { return }

  $worker = $Script:Workers[$WorkerId]
  $worker.Status        = $Status
  $worker.LastHeartbeat = [datetime]::UtcNow

  # Sample memory from current process (workers run in same process for PS)
  $proc = Get-Process -Id $PID -ErrorAction SilentlyContinue
  $memMB = if ($proc) { [Math]::Round($proc.WorkingSet64 / 1MB, 1) } else { 0.0 }
  $worker.MemoryMB = $memMB

  $taskSql = if ($CurrentTask) { "'$($CurrentTask -replace "'","''")'"}  else { 'NULL' }
  $sql = @"
UPDATE WorkerHealth SET
  status        = '$Status',
  memory_mb     = $memMB,
  current_task  = $taskSql,
  last_heartbeat = datetime('now'),
  updated_at    = datetime('now')
WHERE worker_id = '$WorkerId';
"@
  Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
}

# ─────────────────────────────────────────────────────────────────────────────
#  Task completion tracking
# ─────────────────────────────────────────────────────────────────────────────

function Complete-WorkerTask {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $WorkerId,
    [switch] $Failed
  )
  if (-not $Script:Workers.ContainsKey($WorkerId)) { return }
  $worker = $Script:Workers[$WorkerId]
  if ($Failed) { $worker.TasksFailed++ } else { $worker.TasksCompleted++ }

  $col = if ($Failed) { 'tasks_failed' } else { 'tasks_completed' }
  $sql = @"
UPDATE WorkerHealth SET
  $col     = $col + 1,
  status   = 'idle',
  current_task = NULL,
  updated_at   = datetime('now')
WHERE worker_id = '$WorkerId';
"@
  Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
}

# ─────────────────────────────────────────────────────────────────────────────
#  Health query
# ─────────────────────────────────────────────────────────────────────────────

function Get-WorkerHealth {
  [CmdletBinding()]
  [OutputType([object[]])]
  param()
  $sql = @"
SELECT worker_id, worker_type, pid, status, memory_mb,
       tasks_completed, tasks_failed, current_task,
       last_heartbeat, started_at
FROM WorkerHealth
ORDER BY started_at DESC;
"@
  return Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql -ReadOnly
}

# ─────────────────────────────────────────────────────────────────────────────
#  Memory pressure management
# ─────────────────────────────────────────────────────────────────────────────

function Watch-MemoryPressure {
  [CmdletBinding()]
  param()
  $proc  = Get-Process -Id $PID -ErrorAction SilentlyContinue
  if (-not $proc) { return }
  $memMB = $proc.WorkingSet64 / 1MB

  if ($memMB -gt $Script:MemoryLimitMB) {
    Write-LegalLog -Level WARN -Category system `
      -Message "Memory pressure: ${memMB:F0} MB exceeds limit $($Script:MemoryLimitMB) MB; requesting GC"
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    [System.GC]::Collect()

    # Mark idle workers for recycling
    foreach ($w in $Script:Workers.Values) {
      if ($w.Status -eq 'idle' -and $w.MemoryMB -gt ($Script:MemoryLimitMB / $Script:Workers.Count)) {
        $w.Status = 'stopping'
        $sql = "UPDATE WorkerHealth SET status='stopping', updated_at=datetime('now') WHERE worker_id='$($w.Id)';"
        Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
        Write-LegalLog -Level INFO -Category system -Message "Worker marked for recycling" -Data @{ id = $w.Id }
      }
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Dead worker cleanup
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-WorkerGarbageCollection {
  [CmdletBinding()]
  param(
    [int] $StaleHeartbeatSeconds = 60
  )
  $cutoff  = [datetime]::UtcNow.AddSeconds(-$StaleHeartbeatSeconds).ToString('yyyy-MM-dd HH:mm:ss')
  $deadSql = @"
UPDATE WorkerHealth SET
  status     = 'dead',
  updated_at = datetime('now')
WHERE last_heartbeat < '$cutoff'
  AND status NOT IN ('dead','stopping');
"@
  Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $deadSql

  # Remove from in-memory registry
  $stale = $Script:Workers.Values | Where-Object {
    $_.LastHeartbeat -lt [datetime]::UtcNow.AddSeconds(-$StaleHeartbeatSeconds)
  }
  foreach ($w in $stale) {
    $Script:Workers.Remove($w.Id) | Out-Null
    Write-LegalLog -Level WARN -Category system -Message "Dead worker removed" -Data @{ id = $w.Id }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Graceful shutdown
# ─────────────────────────────────────────────────────────────────────────────

function Stop-AllWorkers {
  [CmdletBinding()]
  param(
    [int] $TimeoutSeconds = 30
  )
  Write-LegalLog -Level INFO -Category system -Message "Initiating graceful shutdown"

  foreach ($w in $Script:Workers.Values) {
    $w.Status = 'stopping'
    $sql = "UPDATE WorkerHealth SET status='stopping', updated_at=datetime('now') WHERE worker_id='$($w.Id)';"
    Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
  }

  $deadline = [datetime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([datetime]::UtcNow -lt $deadline) {
    $busy = $Script:Workers.Values | Where-Object { $_.Status -eq 'busy' }
    if ($busy.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }

  foreach ($w in $Script:Workers.Values) {
    $sql = "UPDATE WorkerHealth SET status='dead', updated_at=datetime('now') WHERE worker_id='$($w.Id)';"
    Invoke-SQLite -DatabasePath $Script:DatabasePath -Query $sql
  }

  $Script:Workers.Clear()
  Write-LegalLog -Level INFO -Category system -Message "All workers stopped"
}

# ─────────────────────────────────────────────────────────────────────────────
#  Internal helper — thin SQLite executor (reuses existing module pattern)
# ─────────────────────────────────────────────────────────────────────────────

function Invoke-SQLite {
  param(
    [string] $DatabasePath,
    [string] $Query,
    [switch] $ReadOnly
  )
  if ($ReadOnly) {
    return sqlite3 $DatabasePath $Query 2>$null | ConvertFrom-Csv -Delimiter '|' -Header (
      ($Query -replace '(?s).*SELECT\s+', '' -replace '\s+FROM.*', '' -split ',').Trim()
    )
  }
  sqlite3 $DatabasePath $Query 2>&1 | Out-Null
}

Export-ModuleMember -Function @(
  'Initialize-Supervisor','Register-Worker','Update-WorkerHeartbeat',
  'Complete-WorkerTask','Get-WorkerHealth','Watch-MemoryPressure',
  'Invoke-WorkerGarbageCollection','Stop-AllWorkers'
)
