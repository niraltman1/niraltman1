#Requires -Version 5.1
<#
.SYNOPSIS
    Crash recovery and system integrity validation for Legal-OS.
    Handles: queue restoration, interrupted transaction recovery,
    manifest reconciliation, hash re-verification, and corruption detection.
#>
Set-StrictMode -Version Latest

function Invoke-FullRecovery {
    <#
    .SYNOPSIS
        Master recovery entry point. Runs all recovery stages in order.
        Safe to call at any time – all stages are idempotent.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [string] $AgentSource = 'CrashRecovery'
    )

    Write-LegalLog -Message 'Crash recovery started' -Level WARN -Category system -AgentSource $AgentSource

    $stages = @(
        'Invoke-LockRecovery',
        'Invoke-QueueRecovery',
        'Invoke-TransactionJournalRecovery',
        'Invoke-ManifestReconciliation',
        'Assert-DatabaseIntegrity'
    )

    $results = @{}
    foreach ($stage in $stages) {
        try {
            Write-LegalLog -Message "Recovery stage: $stage" -Level INFO -Category system -AgentSource $AgentSource
            & $stage -DatabasePath $DatabasePath -AgentSource $AgentSource
            $results[$stage] = 'OK'
        } catch {
            $results[$stage] = "FAILED: $_"
            Write-LegalLog -Message "Recovery stage $stage failed: $_" -Level ERROR -Category system -AgentSource $AgentSource
        }
    }

    $failed = $results.Values | Where-Object { $_ -ne 'OK' }
    if ($failed.Count -gt 0) {
        Write-LegalLog -Message "Recovery completed with $($failed.Count) failures" -Level WARN -Category system -AgentSource $AgentSource
    } else {
        Write-LegalLog -Message 'Recovery completed successfully' -Level SUCCESS -Category system -AgentSource $AgentSource
    }
    return $results
}

function Invoke-LockRecovery {
    <#
    .SYNOPSIS
        Purges all expired and orphaned locks.
    #>
    [CmdletBinding()]
    param([string]$DatabasePath, [string]$AgentSource = 'CrashRecovery')
    Clear-ExpiredLocks -DatabasePath $DatabasePath
    Write-LegalLog -Message 'Lock recovery complete' -Level INFO -Category system -AgentSource $AgentSource
}

function Invoke-TransactionJournalRecovery {
    <#
    .SYNOPSIS
        Detects interrupted transaction journal entries and attempts replay or rollback.
    #>
    [CmdletBinding()]
    param([string]$DatabasePath, [string]$AgentSource = 'CrashRecovery')

    $interrupted = sqlite3 -separator "`t" $DatabasePath @"
SELECT transaction_id, document_id, operation_type, phase, path_before, path_after,
       file_hash_before, file_hash_after
  FROM TransactionJournal
 WHERE interrupted = 1 AND replayed = 0
 ORDER BY created_at ASC;
"@

    $count = 0
    foreach ($row in $interrupted) {
        if (-not $row) { continue }
        $fields = $row -split "`t"
        $txId   = $fields[0]
        $opType = $fields[2]
        $phase  = $fields[3]
        $pathBefore = $fields[4]
        $pathAfter  = $fields[5]
        $hashBefore = $fields[6]

        Write-LegalLog -Message "Recovering interrupted transaction=$txId op=$opType phase=$phase" `
                       -Level WARN -Category rollback -AgentSource $AgentSource

        # For interrupted MOVE/RENAME: if destination exists, verify and accept;
        # otherwise restore from source if hash matches
        if ($opType -in @('MOVE','RENAME') -and $phase -eq 'BEGIN') {
            if ((Test-Path -LiteralPath $pathAfter) -and $hashBefore) {
                try {
                    Assert-FileIntegrity -FilePath $pathAfter -ExpectedHash $hashBefore
                    # Hash matches at destination – operation was complete, mark committed
                    sqlite3 $DatabasePath @"
UPDATE TransactionJournal
   SET phase = 'COMMIT', replayed = 1, committed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE transaction_id = '$($txId -replace "'","''")'";
"@
                    Write-LegalLog -Message "Transaction $txId: accepted completed move at $pathAfter" `
                                   -Level INFO -Category rollback -AgentSource $AgentSource
                } catch {
                    # Hash mismatch – restore original
                    if (Test-Path -LiteralPath $pathBefore) {
                        Copy-Item -LiteralPath $pathBefore -Destination $pathAfter -Force
                    }
                    sqlite3 $DatabasePath @"
UPDATE TransactionJournal
   SET phase = 'ROLLBACK', replayed = 1
 WHERE transaction_id = '$($txId -replace "'","''")'";
"@
                    Write-LegalLog -Message "Transaction $txId: rolled back corrupt move" `
                                   -Level WARN -Category rollback -AgentSource $AgentSource
                }
            } elseif (Test-Path -LiteralPath $pathBefore) {
                # File still at source – operation did not complete, mark rolled back
                sqlite3 $DatabasePath @"
UPDATE TransactionJournal
   SET phase = 'ROLLBACK', replayed = 1
 WHERE transaction_id = '$($txId -replace "'","''")'";
"@
                Write-LegalLog -Message "Transaction $txId: source intact, operation never completed" `
                               -Level INFO -Category rollback -AgentSource $AgentSource
            }
        } else {
            # Non-recoverable transaction – mark as replayed so it doesn't loop
            sqlite3 $DatabasePath @"
UPDATE TransactionJournal
   SET replayed = 1
 WHERE transaction_id = '$($txId -replace "'","''")'";
"@
        }
        $count++
    }

    Write-LegalLog -Message "Transaction journal recovery: processed $count interrupted transactions" `
                   -Level INFO -Category system -AgentSource $AgentSource
}

function Invoke-ManifestReconciliation {
    <#
    .SYNOPSIS
        Verifies that all Documents with a non-terminal processing state have at least
        one ManifestSnapshot, and resets documents with no snapshot to DISCOVERED.
    #>
    [CmdletBinding()]
    param([string]$DatabasePath, [string]$AgentSource = 'CrashRecovery')

    $orphans = sqlite3 -separator "`t" $DatabasePath @"
SELECT d.id, d.filename, d.processing_state
  FROM Documents d
  LEFT JOIN ManifestSnapshots m ON m.document_id = d.id
 WHERE d.processing_state NOT IN ('DISCOVERED','VERIFIED','ROLLED_BACK')
   AND m.id IS NULL;
"@

    $count = 0
    foreach ($row in $orphans) {
        if (-not $row) { continue }
        $fields = $row -split "`t"
        $docId  = $fields[0]
        Write-LegalLog -Message "Reconcile: document id=$docId has no manifest snapshot, resetting to DISCOVERED" `
                       -Level WARN -Category rollback -AgentSource $AgentSource
        sqlite3 $DatabasePath @"
UPDATE Documents
   SET processing_state = 'DISCOVERED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id = $docId;
"@
        $count++
    }

    Write-LegalLog -Message "Manifest reconciliation: reset $count orphaned documents to DISCOVERED" `
                   -Level INFO -Category system -AgentSource $AgentSource
}

function Assert-DatabaseIntegrity {
    <#
    .SYNOPSIS
        Runs SQLite PRAGMA integrity_check and foreign_key_check.
        Throws if corruption is detected.
    #>
    [CmdletBinding()]
    param([string]$DatabasePath, [string]$AgentSource = 'CrashRecovery')

    $integ = sqlite3 $DatabasePath "PRAGMA integrity_check;"
    if ($integ -ne 'ok') {
        throw "SQLite integrity_check failed: $integ"
    }

    $fkErrs = sqlite3 $DatabasePath "PRAGMA foreign_key_check;"
    if ($fkErrs) {
        Write-LegalLog -Message "Foreign key violations found: $fkErrs" -Level WARN -Category system -AgentSource $AgentSource
    }

    # Force WAL checkpoint after recovery
    sqlite3 $DatabasePath "PRAGMA wal_checkpoint(FULL);" | Out-Null

    Write-LegalLog -Message 'Database integrity check passed' -Level SUCCESS -Category system -AgentSource $AgentSource
}

function New-CrashBundle {
    <#
    .SYNOPSIS
        Generates a diagnostic crash bundle: recent logs, queue state, DB integrity,
        active transactions, and manifest state.
        Saves as a ZIP to the specified output directory.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $LogDirectory,
        [Parameter(Mandatory)] [string] $OutputDirectory
    )

    if (-not (Test-Path $OutputDirectory)) { New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null }

    $bundleId  = [System.Guid]::NewGuid().ToString()
    $bundleDir = Join-Path $env:TEMP "legalos_crash_$bundleId"
    New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

    # Recent logs (last 24h)
    $cutoff = (Get-Date).AddHours(-24).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    Get-ChildItem -Path $LogDirectory -Filter '*.jsonl' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-25) } |
        Copy-Item -Destination $bundleDir -ErrorAction SilentlyContinue

    # Queue state
    if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
        sqlite3 $DatabasePath ".mode json" "SELECT * FROM ProcessingQueue ORDER BY created_at DESC LIMIT 200;" |
            Set-Content -Path (Join-Path $bundleDir 'queue_state.json') -Encoding UTF8

        sqlite3 $DatabasePath ".mode json" "SELECT * FROM TransactionJournal WHERE interrupted=1 LIMIT 100;" |
            Set-Content -Path (Join-Path $bundleDir 'interrupted_transactions.json') -Encoding UTF8

        sqlite3 $DatabasePath ".mode json" "SELECT * FROM Locks;" |
            Set-Content -Path (Join-Path $bundleDir 'active_locks.json') -Encoding UTF8

        $integ = sqlite3 $DatabasePath "PRAGMA integrity_check;"
        Set-Content -Path (Join-Path $bundleDir 'db_integrity.txt') -Value $integ -Encoding UTF8
    }

    # System info
    @{
        bundleId    = $bundleId
        generatedAt = (Get-IsoNow)
        psVersion   = $PSVersionTable.PSVersion.ToString()
        osVersion   = [System.Environment]::OSVersion.VersionString
        dbPath      = $DatabasePath
    } | ConvertTo-Json | Set-Content -Path (Join-Path $bundleDir 'system_info.json') -Encoding UTF8

    $zipPath = Join-Path $OutputDirectory "crash_bundle_$bundleId.zip"
    Compress-Archive -Path "$bundleDir\*" -DestinationPath $zipPath -Force
    Remove-Item -Path $bundleDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-LegalLog -Message "Crash bundle created: $zipPath" -Level INFO -Category system -AgentSource 'CrashRecovery'
    return $zipPath
}

Export-ModuleMember -Function Invoke-FullRecovery, Invoke-LockRecovery, `
                               Invoke-TransactionJournalRecovery, Invoke-ManifestReconciliation, `
                               Assert-DatabaseIntegrity, New-CrashBundle
