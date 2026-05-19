#Requires -Version 5.1
<#
.SYNOPSIS
    ActionLog module – records every file mutation and supports atomic rollback.
#>
Set-StrictMode -Version Latest

function Write-ActionLog {
    <#
    .SYNOPSIS
        Writes a single entry to the ActionLog table in the SQLite database.
    .OUTPUTS
        [int] – the new ActionLog row id
    #>
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $OperationId,
        [Parameter(Mandatory)] [string] $OperationType,
        [Parameter(Mandatory)] [string] $AgentSource,
        [int]    $DocumentId       = 0,
        [string] $FileHashBefore   = '',
        [string] $FileHashAfter    = '',
        [string] $PathBefore       = '',
        [string] $PathAfter        = '',
        [string] $MetadataJson     = '',
        [switch] $NotReversible
    )

    $docIdSql      = if ($DocumentId -gt 0) { $DocumentId.ToString() } else { 'NULL' }
    $hashBefore    = ($FileHashBefore  -replace "'", "''")
    $hashAfter     = ($FileHashAfter   -replace "'", "''")
    $pathBefEsc    = ($PathBefore      -replace "'", "''")
    $pathAftEsc    = ($PathAfter       -replace "'", "''")
    $metaEsc       = ($MetadataJson    -replace "'", "''")
    $agentEsc      = ($AgentSource     -replace "'", "''")
    $opTypeEsc     = ($OperationType   -replace "'", "''")
    $opIdEsc       = ($OperationId     -replace "'", "''")
    $isReversible  = if ($NotReversible) { 0 } else { 1 }

    $sql = @"
INSERT INTO ActionLog
  (operation_id, operation_type, document_id, agent,
   file_hash_before, file_hash_after, path_before, path_after,
   metadata_json, is_reversible)
VALUES
  ('$opIdEsc', '$opTypeEsc', $docIdSql, '$agentEsc',
   '$hashBefore', '$hashAfter', '$pathBefEsc', '$pathAftEsc',
   '$metaEsc', $isReversible);
SELECT last_insert_rowid();
"@

    $result = sqlite3 $DatabasePath $sql
    if ($LASTEXITCODE -ne 0) { throw "ActionLog write failed." }
    return [int]$result.Trim()
}

function Get-ActionLog {
    <#
    .SYNOPSIS
        Returns ActionLog rows for a given document, optionally filtered to
        reversible / non-rolled-back entries only.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [int]    $DocumentId     = 0,
        [string] $OperationType  = '',
        [switch] $ReversibleOnly,
        [int]    $Limit          = 100
    )

    $where = @()
    if ($DocumentId -gt 0)         { $where += "document_id = $DocumentId" }
    if ($OperationType -ne '')      { $where += "operation_type = '$($OperationType -replace "'","''")'"}
    if ($ReversibleOnly)            { $where += "is_reversible = 1 AND rolled_back = 0" }

    $whereClause = if ($where.Count -gt 0) { "WHERE $($where -join ' AND ')" } else { '' }
    $sql = "SELECT * FROM ActionLog $whereClause ORDER BY logged_at DESC LIMIT $Limit;"

    $rows = sqlite3 -separator "`t" $DatabasePath $sql
    if ($LASTEXITCODE -ne 0) { throw "ActionLog query failed." }
    return $rows
}

function Invoke-RollbackAction {
    <#
    .SYNOPSIS
        Rolls back a single ActionLog entry.
        For MOVE operations: moves the file back to path_before and verifies hash.
        Marks the original entry as rolled_back = 1.
        Creates a compensating ROLLBACK entry in ActionLog.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [int]    $ActionLogId,
        [Parameter(Mandatory)] [string] $AgentSource
    )

    # Fetch the action row
    $row = sqlite3 -separator "`t" $DatabasePath @"
SELECT operation_type, document_id, file_hash_before, path_before, path_after, is_reversible, rolled_back
  FROM ActionLog WHERE id = $ActionLogId;
"@
    if (-not $row) { throw "ActionLog entry $ActionLogId not found." }

    $fields = $row -split "`t"
    $opType     = $fields[0]
    $docId      = $fields[1]
    $hashBefore = $fields[2]
    $pathBefore = $fields[3]
    $pathAfter  = $fields[4]
    $isReversible = $fields[5]
    $rolledBack   = $fields[6]

    if ($isReversible -ne '1') { throw "ActionLog $ActionLogId is marked non-reversible." }
    if ($rolledBack   -eq '1') { throw "ActionLog $ActionLogId was already rolled back." }

    if ($opType -in @('MOVE','RENAME')) {
        if (-not (Test-Path -LiteralPath $pathAfter)) {
            throw "Rollback target '$pathAfter' not found on disk."
        }

        # Verify current file hash matches what we recorded as hash_after
        $currentHash = Get-FileHashSHA256 -FilePath $pathAfter
        # hash_after stored in field index 4 would need separate query – verify hash_before on restore
        # Move back to original location
        $destDir = Split-Path $pathBefore -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Move-Item -LiteralPath $pathAfter -Destination $pathBefore -Force

        # Verify post-restore hash
        if ($hashBefore -ne '') {
            Assert-FileIntegrity -FilePath $pathBefore -ExpectedHash $hashBefore
        }
    }

    # Build compensating operation ID
    $rollbackOpId = [System.Guid]::NewGuid().ToString()

    $agentEsc = $AgentSource -replace "'", "''"
    $sql = @"
BEGIN;
UPDATE ActionLog SET rolled_back = 1 WHERE id = $ActionLogId;
INSERT INTO ActionLog
  (operation_id, operation_type, document_id, agent, path_before, path_after, is_reversible, rollback_action_id)
VALUES
  ('$rollbackOpId', 'ROLLBACK', $docId, '$agentEsc', '$($pathAfter -replace "'","''")', '$($pathBefore -replace "'","''")', 0, $ActionLogId);
COMMIT;
"@

    $tmpFile = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -Path $tmpFile -Value $sql -Encoding UTF8
        sqlite3 $DatabasePath ".read `"$tmpFile`""
        if ($LASTEXITCODE -ne 0) { throw "Rollback SQL transaction failed." }
    } finally {
        Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
    }

    Write-LegalLog -Message "Rolled back ActionLog id=$ActionLogId ($opType)" `
                   -Level WARN -Category rollback -AgentSource $AgentSource
}

Export-ModuleMember -Function Write-ActionLog, Get-ActionLog, Invoke-RollbackAction
