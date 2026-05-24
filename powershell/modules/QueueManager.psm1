#Requires -Version 5.1
<#
.SYNOPSIS
    Durable processing queue backed by SQLite.
    Supports crash recovery, retry with exponential backoff, poison-queue isolation,
    worker locking, and adaptive concurrency.
#>
Set-StrictMode -Version Latest

$Script:DefaultMaxRetries       = 3
$Script:DefaultLockTTLSeconds   = 300    # 5 minutes
$Script:BaseBackoffSeconds      = 5
$Script:MaxBackoffSeconds       = 600    # 10 minutes
$Script:MaxConcurrentWorkers    = 4
$Script:WorkerId                = [System.Guid]::NewGuid().ToString()

# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────
function Get-IsoNow { (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ') }

function Invoke-SqliteQuery {
    param([string]$DbPath, [string]$Sql)
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -Path $tmp -Value $Sql -Encoding UTF8
        $out = sqlite3 $DbPath ".read `"$tmp`"" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "SQLite error: $out" }
        return $out
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ─────────────────────────────────────────────
#  Enqueue
# ─────────────────────────────────────────────
function Add-QueueItem {
    <#
    .SYNOPSIS
        Adds a document to the processing queue.
        Idempotent – silently skips if file_hash already queued and not in terminal state.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $FileHash,
        [Parameter(Mandatory)] [string] $OriginalPath,
        [int]    $DocumentId  = 0,
        [int]    $Priority    = 5,
        [int]    $MaxRetries  = $Script:DefaultMaxRetries,
        [string] $ManifestRef = ''
    )

    # Idempotency check
    $existing = sqlite3 $DatabasePath @"
SELECT item_id FROM ProcessingQueue
 WHERE file_hash = '$($FileHash -replace "'","''")'
   AND current_state NOT IN ('VERIFIED','ROLLED_BACK','FAILED')
 LIMIT 1;
"@
    if ($existing) {
        Write-LegalLog -Message "Queue: item already present for hash $FileHash (item=$($existing.Trim()))" `
                       -Level DEBUG -Category system -AgentSource 'QueueManager'
        return $existing.Trim()
    }

    $itemId    = [System.Guid]::NewGuid().ToString()
    $docIdSql  = if ($DocumentId -gt 0) { $DocumentId } else { 'NULL' }
    $pathEsc   = $OriginalPath  -replace "'", "''"
    $hashEsc   = $FileHash      -replace "'", "''"
    $manifestEsc = $ManifestRef -replace "'", "''"

    Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
INSERT INTO ProcessingQueue
  (item_id, document_id, file_hash, original_path,
   current_state, target_state, priority, max_retries, manifest_ref)
VALUES
  ('$itemId', $docIdSql, '$hashEsc', '$pathEsc',
   'DISCOVERED', 'VERIFIED', $Priority, $MaxRetries, '$manifestEsc');
"@

    Write-LegalLog -Message "Queue: enqueued item=$itemId hash=$FileHash" `
                   -Level INFO -Category system -AgentSource 'QueueManager'
    return $itemId
}

# ─────────────────────────────────────────────
#  Dequeue (with worker lock)
# ─────────────────────────────────────────────
function Get-NextQueueItem {
    <#
    .SYNOPSIS
        Atomically claims the next available queue item for this worker.
        Returns a hashtable with item data, or $null if queue is empty.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [string] $WorkerId      = $Script:WorkerId,
        [int]    $LockTTLSecs   = $Script:DefaultLockTTLSeconds
    )

    $lockExpiry = (Get-Date).AddSeconds($LockTTLSecs).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $now        = Get-IsoNow

    # Reclaim expired locks from crashed workers first
    Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
UPDATE ProcessingQueue
   SET worker_id       = NULL,
       locked_at       = NULL,
       lock_expires_at = NULL,
       updated_at      = '$now'
 WHERE worker_id IS NOT NULL
   AND lock_expires_at < '$now'
   AND current_state NOT IN ('VERIFIED','ROLLED_BACK');
"@

    # Find and claim next item
    $row = sqlite3 -separator "`t" $DatabasePath @"
SELECT item_id, document_id, file_hash, original_path, current_state, retry_count, manifest_ref
  FROM ProcessingQueue
 WHERE is_poisoned = 0
   AND worker_id IS NULL
   AND current_state NOT IN ('VERIFIED','ROLLED_BACK')
   AND (next_retry_at IS NULL OR next_retry_at <= '$now')
 ORDER BY priority DESC, created_at ASC
 LIMIT 1;
"@

    if (-not $row) { return $null }

    $fields = $row -split "`t"
    $itemId = $fields[0]

    Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
UPDATE ProcessingQueue
   SET worker_id       = '$($WorkerId -replace "'","''")',
       locked_at       = '$now',
       lock_expires_at = '$lockExpiry',
       processing_start = '$now'
 WHERE item_id = '$($itemId -replace "'","''")'
   AND worker_id IS NULL;
"@

    # Verify we actually acquired the lock
    $ownerId = sqlite3 $DatabasePath "SELECT worker_id FROM ProcessingQueue WHERE item_id = '$($itemId -replace "'","''")';"
    if ($ownerId.Trim() -ne $WorkerId) { return $null }

    return @{
        ItemId       = $itemId
        DocumentId   = if ($fields[1]) { [int]$fields[1] } else { 0 }
        FileHash     = $fields[2]
        OriginalPath = $fields[3]
        CurrentState = $fields[4]
        RetryCount   = [int]$fields[5]
        ManifestRef  = $fields[6]
    }
}

# ─────────────────────────────────────────────
#  Complete / Fail
# ─────────────────────────────────────────────
function Complete-QueueItem {
    <#
    .SYNOPSIS
        Marks a queue item as completed (state = VERIFIED).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ItemId,
        [string] $FinalState = 'VERIFIED'
    )
    $now = Get-IsoNow
    $idEsc = $ItemId -replace "'", "''"
    Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
UPDATE ProcessingQueue
   SET current_state    = '$FinalState',
       worker_id        = NULL,
       locked_at        = NULL,
       lock_expires_at  = NULL,
       processing_end   = '$now'
 WHERE item_id = '$idEsc';
"@
    Write-LegalLog -Message "Queue: completed item=$ItemId state=$FinalState" `
                   -Level INFO -Category system -AgentSource 'QueueManager'
}

function Fail-QueueItem {
    <#
    .SYNOPSIS
        Records a failure for a queue item.
        Schedules retry with exponential backoff or poisons if max retries exceeded.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ItemId,
        [Parameter(Mandatory)] [string] $ErrorMessage,
        [int] $MaxRetries = $Script:DefaultMaxRetries
    )

    $now = Get-IsoNow
    $idEsc  = $ItemId      -replace "'", "''"
    $errEsc = $ErrorMessage -replace "'", "''"

    $retryCount = [int](sqlite3 $DatabasePath "SELECT retry_count FROM ProcessingQueue WHERE item_id = '$idEsc';")
    $newCount   = $retryCount + 1

    if ($newCount -ge $MaxRetries) {
        # Poison the item
        Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
UPDATE ProcessingQueue
   SET is_poisoned     = 1,
       poison_reason   = '$errEsc',
       current_state   = 'FAILED',
       worker_id       = NULL,
       locked_at       = NULL,
       lock_expires_at = NULL,
       retry_count     = $newCount,
       error_message   = '$errEsc'
 WHERE item_id = '$idEsc';
"@
        Write-LegalLog -Message "Queue: item=$ItemId poisoned after $newCount retries: $ErrorMessage" `
                       -Level ERROR -Category system -AgentSource 'QueueManager'
    } else {
        # Exponential backoff
        $backoffSec = [Math]::Min($Script:BaseBackoffSeconds * [Math]::Pow(2, $retryCount), $Script:MaxBackoffSeconds)
        $nextRetry  = (Get-Date).AddSeconds($backoffSec).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        Invoke-SqliteQuery -DbPath $DatabasePath -Sql @"
UPDATE ProcessingQueue
   SET retry_count      = $newCount,
       next_retry_at    = '$nextRetry',
       worker_id        = NULL,
       locked_at        = NULL,
       lock_expires_at  = NULL,
       error_message    = '$errEsc',
       current_state    = 'FAILED'
 WHERE item_id = '$idEsc';
"@
        Write-LegalLog -Message "Queue: item=$ItemId failed (attempt $newCount/$MaxRetries), retry at $nextRetry" `
                       -Level WARN -Category system -AgentSource 'QueueManager'
    }
}

# ─────────────────────────────────────────────
#  Queue status
# ─────────────────────────────────────────────
function Get-QueueDepth {
    <#
    .SYNOPSIS
        Returns a hashtable of queue depths by state.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $DatabasePath)

    $rows = sqlite3 -separator "`t" $DatabasePath @"
SELECT current_state, COUNT(*) FROM ProcessingQueue
 WHERE is_poisoned = 0
 GROUP BY current_state;
"@
    $result = @{}
    foreach ($row in $rows) {
        if ($row) {
            $parts = $row -split "`t"
            $result[$parts[0]] = [int]$parts[1]
        }
    }
    $result['POISONED'] = [int](sqlite3 $DatabasePath "SELECT COUNT(*) FROM ProcessingQueue WHERE is_poisoned = 1;")
    return $result
}

function Get-PoisonedItems {
    <#
    .SYNOPSIS
        Returns all poisoned queue items for inspection.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $DatabasePath)
    sqlite3 -separator "`t" $DatabasePath @"
SELECT item_id, file_hash, original_path, retry_count, poison_reason, created_at
  FROM ProcessingQueue
 WHERE is_poisoned = 1
 ORDER BY created_at DESC;
"@
}

function Invoke-QueueRecovery {
    <#
    .SYNOPSIS
        Recovers the queue after a crash.
        - Releases expired worker locks
        - Resets interrupted FAILED items with remaining retries
        - Logs orphaned in-progress items
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [string] $AgentSource = 'QueueManager'
    )

    $now = Get-IsoNow

    # Release expired locks
    $released = sqlite3 $DatabasePath @"
UPDATE ProcessingQueue
   SET worker_id = NULL, locked_at = NULL, lock_expires_at = NULL
 WHERE worker_id IS NOT NULL AND lock_expires_at < '$now';
SELECT changes();
"@
    Write-LegalLog -Message "Queue recovery: released $($released[-1]) expired locks" `
                   -Level INFO -Category system -AgentSource $AgentSource

    # Re-queue FAILED items that still have retries and whose next_retry has passed
    $requeued = sqlite3 $DatabasePath @"
UPDATE ProcessingQueue
   SET current_state = 'DISCOVERED',
       next_retry_at = NULL
 WHERE current_state = 'FAILED'
   AND is_poisoned   = 0
   AND retry_count   < max_retries
   AND (next_retry_at IS NULL OR next_retry_at <= '$now');
SELECT changes();
"@
    Write-LegalLog -Message "Queue recovery: re-queued $($requeued[-1]) failed items" `
                   -Level INFO -Category system -AgentSource $AgentSource
}

Export-ModuleMember -Function `
    Add-QueueItem, Get-NextQueueItem, Complete-QueueItem, Fail-QueueItem, `
    Get-QueueDepth, Get-PoisonedItems, Invoke-QueueRecovery
