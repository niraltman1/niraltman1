#Requires -Version 5.1
<#
.SYNOPSIS
    ManifestSnapshot module – captures pre-mutation state and enables
    full restoration of files and metadata.
#>
Set-StrictMode -Version Latest

function New-ManifestSnapshot {
    <#
    .SYNOPSIS
        Creates a ManifestSnapshot record for a document BEFORE any mutation.
        Returns the snapshot_id (UUID string).
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [int]    $DocumentId,
        [Parameter(Mandatory)] [string] $TriggerEvent,
        [string] $AgentSource = 'ManifestSnapshot'
    )

    # Fetch current document row as JSON snapshot
    $docJson = sqlite3 $DatabasePath @"
SELECT json_object(
  'id',               id,
  'file_hash',        file_hash,
  'original_path',    original_path,
  'storage_path',     storage_path,
  'filename',         filename,
  'extension',        extension,
  'file_size_bytes',  file_size_bytes,
  'processing_state', processing_state,
  'created_at',       created_at,
  'updated_at',       updated_at
) FROM Documents WHERE id = $DocumentId;
"@
    if (-not $docJson -or $LASTEXITCODE -ne 0) {
        throw "Document id=$DocumentId not found for snapshot."
    }

    # Parse key fields from the row (separate fast queries)
    $fileHash    = sqlite3 $DatabasePath "SELECT file_hash    FROM Documents WHERE id = $DocumentId;"
    $origPath    = sqlite3 $DatabasePath "SELECT original_path FROM Documents WHERE id = $DocumentId;"
    $storagePath = sqlite3 $DatabasePath "SELECT storage_path  FROM Documents WHERE id = $DocumentId;"
    $fileSize    = sqlite3 $DatabasePath "SELECT file_size_bytes FROM Documents WHERE id = $DocumentId;"

    # Get file mtime if accessible
    $mtime = ''
    if (Test-Path -LiteralPath $storagePath.Trim()) {
        $mtime = (Get-Item -LiteralPath $storagePath.Trim()).LastWriteTimeUtc.ToString('o')
    } elseif (Test-Path -LiteralPath $origPath.Trim()) {
        $mtime = (Get-Item -LiteralPath $origPath.Trim()).LastWriteTimeUtc.ToString('o')
    }

    $snapshotId    = [System.Guid]::NewGuid().ToString()
    $triggerEsc    = $TriggerEvent   -replace "'", "''"
    $fileHashEsc   = $fileHash.Trim()  -replace "'", "''"
    $origPathEsc   = $origPath.Trim()  -replace "'", "''"
    $storageEsc    = $storagePath.Trim() -replace "'", "''"
    $mtimeEsc      = $mtime             -replace "'", "''"
    $docJsonEsc    = $docJson.Trim()    -replace "'", "''"

    $sql = @"
INSERT INTO ManifestSnapshots
  (snapshot_id, document_id, snapshot_data, file_hash,
   original_path, storage_path, original_mtime, original_size, trigger_event)
VALUES
  ('$snapshotId', $DocumentId, '$docJsonEsc', '$fileHashEsc',
   '$origPathEsc', '$storageEsc', '$mtimeEsc', $($fileSize.Trim()), '$triggerEsc');
"@

    sqlite3 $DatabasePath $sql
    if ($LASTEXITCODE -ne 0) { throw "ManifestSnapshot insert failed." }

    Write-LegalLog -Message "Manifest snapshot created: $snapshotId for doc=$DocumentId (trigger: $TriggerEvent)" `
                   -Level INFO -Category system -AgentSource $AgentSource

    return $snapshotId
}

function Get-ManifestSnapshot {
    <#
    .SYNOPSIS
        Returns the JSON snapshot_data for a given snapshot_id.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $SnapshotId
    )

    $idEsc = $SnapshotId -replace "'", "''"
    $result = sqlite3 $DatabasePath "SELECT snapshot_data FROM ManifestSnapshots WHERE snapshot_id = '$idEsc';"
    if (-not $result -or $LASTEXITCODE -ne 0) {
        throw "Snapshot '$SnapshotId' not found."
    }
    return $result.Trim()
}

function Restore-FromManifest {
    <#
    .SYNOPSIS
        Restores a document's metadata and file to the state captured in a
        ManifestSnapshot.  File is copied back only if it differs from current.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [string] $SnapshotId,
        [Parameter(Mandatory)] [string] $AgentSource
    )

    $idEsc = $SnapshotId -replace "'", "''"
    $row   = sqlite3 -separator "`t" $DatabasePath @"
SELECT document_id, file_hash, original_path, storage_path, original_size
  FROM ManifestSnapshots WHERE snapshot_id = '$idEsc';
"@
    if (-not $row) { throw "Snapshot '$SnapshotId' not found." }

    $fields      = $row -split "`t"
    $documentId  = [int]$fields[0]
    $fileHash    = $fields[1]
    $origPath    = $fields[2]
    $storagePath = $fields[3]

    # Restore file if current storage differs
    if (Test-Path -LiteralPath $storagePath) {
        $currentHash = Get-FileHashSHA256 -FilePath $storagePath
        if ($currentHash -ne $fileHash) {
            # Look for original source
            if (Test-Path -LiteralPath $origPath) {
                $sourceHash = Get-FileHashSHA256 -FilePath $origPath
                if ($sourceHash -eq $fileHash) {
                    Copy-Item -LiteralPath $origPath -Destination $storagePath -Force
                    Write-LegalLog -Message "Restored file from original_path: $origPath → $storagePath" `
                                   -Level WARN -Category rollback -AgentSource $AgentSource
                } else {
                    Write-LegalLog -Message "Source file hash mismatch during restore for snapshot $SnapshotId" `
                                   -Level ERROR -Category rollback -AgentSource $AgentSource
                }
            } else {
                Write-LegalLog -Message "Original file not found for restore: $origPath" `
                               -Level ERROR -Category rollback -AgentSource $AgentSource
            }
        }
    }

    # Restore metadata: reset processing_state to DISCOVERED for reprocessing
    $sql = @"
UPDATE Documents
   SET processing_state = 'DISCOVERED',
       updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id = $documentId;
"@
    sqlite3 $DatabasePath $sql
    if ($LASTEXITCODE -ne 0) { throw "Metadata restore failed for doc=$documentId." }

    Write-LegalLog -Message "Manifest restore complete for snapshot $SnapshotId (doc=$documentId)" `
                   -Level INFO -Category rollback -AgentSource $AgentSource
}

Export-ModuleMember -Function New-ManifestSnapshot, Get-ManifestSnapshot, Restore-FromManifest
