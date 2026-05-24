#Requires -Version 5.1
<#
.SYNOPSIS
    Distributed locking module for Factum IL.
    Provides file-level and resource-level mutex operations backed by SQLite.
    Locks auto-expire to prevent deadlocks from crashed workers.
#>
Set-StrictMode -Version Latest

$Script:DefaultLockTTLSeconds = 300
$Script:LockOwnerId = [System.Guid]::NewGuid().ToString()

function Get-LockOwnerId { return $Script:LockOwnerId }

function Acquire-Lock {
    <#
    .SYNOPSIS
        Acquires a lock on a resource.  Returns $true on success, $false if already locked.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ResourceKey,
        [string] $OwnerType  = 'worker',
        [int]    $TTLSeconds = $Script:DefaultLockTTLSeconds,
        [string] $OwnerId    = $Script:LockOwnerId
    )

    $now     = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')
    $expires = (Get-Date).AddSeconds($TTLSeconds).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    $keyEsc  = $ResourceKey -replace "'", "''"
    $ownEsc  = $OwnerId     -replace "'", "''"
    $typEsc  = $OwnerType   -replace "'", "''"

    # Remove expired locks first
    sqlite3 $DatabasePath "DELETE FROM Locks WHERE expires_at < '$now';"

    # Attempt INSERT (will fail silently on UNIQUE conflict)
    $result = sqlite3 $DatabasePath @"
INSERT OR IGNORE INTO Locks (resource_key, owner_id, owner_type, expires_at)
VALUES ('$keyEsc', '$ownEsc', '$typEsc', '$expires');
SELECT changes();
"@
    $acquired = ([int]($result | Select-Object -Last 1)) -gt 0
    if ($acquired) {
        Write-LegalLog -Message "Lock acquired: $ResourceKey (owner=$OwnerId ttl=${TTLSeconds}s)" `
                       -Level DEBUG -Category system -AgentSource 'LockManager'
    }
    return $acquired
}

function Wait-ForLock {
    <#
    .SYNOPSIS
        Blocks until the lock is acquired or timeout is reached.
        Polls every $PollMs milliseconds.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ResourceKey,
        [string] $OwnerType     = 'worker',
        [int]    $TTLSeconds    = $Script:DefaultLockTTLSeconds,
        [int]    $TimeoutSecs   = 30,
        [int]    $PollMs        = 500
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSecs)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Acquire-Lock -DatabasePath $DatabasePath -ResourceKey $ResourceKey `
                         -OwnerType $OwnerType -TTLSeconds $TTLSeconds) {
            return $true
        }
        Start-Sleep -Milliseconds $PollMs
    }
    Write-LegalLog -Message "Lock timeout after ${TimeoutSecs}s for: $ResourceKey" `
                   -Level WARN -Category system -AgentSource 'LockManager'
    return $false
}

function Release-Lock {
    <#
    .SYNOPSIS
        Releases a lock owned by this process.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ResourceKey,
        [string] $OwnerId = $Script:LockOwnerId
    )
    $keyEsc = $ResourceKey -replace "'", "''"
    $ownEsc = $OwnerId     -replace "'", "''"
    sqlite3 $DatabasePath "DELETE FROM Locks WHERE resource_key = '$keyEsc' AND owner_id = '$ownEsc';"
    Write-LegalLog -Message "Lock released: $ResourceKey" -Level DEBUG -Category system -AgentSource 'LockManager'
}

function Test-LockHeld {
    <#
    .SYNOPSIS
        Returns $true if a non-expired lock exists for the resource key.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $ResourceKey
    )
    $now    = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')
    $keyEsc = $ResourceKey -replace "'", "''"
    $count  = sqlite3 $DatabasePath @"
SELECT COUNT(*) FROM Locks WHERE resource_key = '$keyEsc' AND expires_at > '$now';
"@
    return ([int]$count.Trim()) -gt 0
}

function Invoke-WithLock {
    <#
    .SYNOPSIS
        Executes a script block while holding a lock.
        Automatically releases the lock on exit (normal or exception).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string]     $DatabasePath,
        [Parameter(Mandatory)] [string]     $ResourceKey,
        [Parameter(Mandatory)] [scriptblock]$Action,
        [int]    $TTLSeconds  = $Script:DefaultLockTTLSeconds,
        [int]    $TimeoutSecs = 30
    )

    $acquired = Wait-ForLock -DatabasePath $DatabasePath -ResourceKey $ResourceKey `
                             -TTLSeconds $TTLSeconds -TimeoutSecs $TimeoutSecs
    if (-not $acquired) {
        throw "Could not acquire lock on '$ResourceKey' within ${TimeoutSecs}s."
    }
    try {
        & $Action
    } finally {
        Release-Lock -DatabasePath $DatabasePath -ResourceKey $ResourceKey
    }
}

function Clear-ExpiredLocks {
    <#
    .SYNOPSIS
        Purges all expired lock records.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $DatabasePath)
    $now = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')
    $deleted = sqlite3 $DatabasePath @"
DELETE FROM Locks WHERE expires_at < '$now';
SELECT changes();
"@
    $n = [int]($deleted | Select-Object -Last 1)
    if ($n -gt 0) {
        Write-LegalLog -Message "Cleared $n expired locks" -Level DEBUG -Category system -AgentSource 'LockManager'
    }
}

Export-ModuleMember -Function Acquire-Lock, Wait-ForLock, Release-Lock, Test-LockHeld, `
                               Invoke-WithLock, Clear-ExpiredLocks, Get-LockOwnerId
