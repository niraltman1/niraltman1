#Requires -Version 5.1
<#
.SYNOPSIS
    Document processing state machine for Legal-OS.
    Enforces valid transitions and logs every state change atomically.
#>
Set-StrictMode -Version Latest

# Valid states
$Script:ValidStates = @(
    'DISCOVERED', 'HASHED', 'OCR_PENDING', 'OCR_COMPLETE',
    'CLASSIFIED', 'ENRICHED', 'REVIEW_PENDING', 'APPLIED',
    'VERIFIED', 'FAILED', 'ROLLED_BACK'
)

# Allowed transitions: key = from-state, value = array of allowed to-states
$Script:AllowedTransitions = @{
    'DISCOVERED'    = @('HASHED',       'FAILED')
    'HASHED'        = @('OCR_PENDING',  'FAILED')
    'OCR_PENDING'   = @('OCR_COMPLETE', 'FAILED')
    'OCR_COMPLETE'  = @('CLASSIFIED',   'FAILED')
    'CLASSIFIED'    = @('ENRICHED',     'REVIEW_PENDING', 'FAILED')
    'ENRICHED'      = @('REVIEW_PENDING','FAILED')
    'REVIEW_PENDING'= @('APPLIED',      'FAILED')
    'APPLIED'       = @('VERIFIED',     'FAILED')
    'VERIFIED'      = @('FAILED')           # terminal success; can still be marked failed
    'FAILED'        = @('ROLLED_BACK',  'DISCOVERED')  # can retry from DISCOVERED
    'ROLLED_BACK'   = @('DISCOVERED')       # allows re-ingestion
}

function Assert-ValidTransition {
    <#
    .SYNOPSIS
        Throws if the transition from $FromState to $ToState is not permitted.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $FromState,
        [Parameter(Mandatory)] [string] $ToState
    )
    if ($FromState -notin $Script:ValidStates) {
        throw "Unknown state: '$FromState'"
    }
    if ($ToState -notin $Script:ValidStates) {
        throw "Unknown state: '$ToState'"
    }
    $allowed = $Script:AllowedTransitions[$FromState]
    if ($ToState -notin $allowed) {
        throw "Invalid state transition: '$FromState' → '$ToState'. Allowed targets: $($allowed -join ', ')"
    }
}

function Get-DocumentState {
    <#
    .SYNOPSIS
        Retrieves the current processing state of a document from the database.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [int]    $DocumentId
    )
    if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
        throw 'sqlite3 CLI not available. Ensure SQLite is installed and in PATH.'
    }
    $result = sqlite3 $DatabasePath "SELECT processing_state FROM Documents WHERE id = $DocumentId;"
    if (-not $result) {
        throw "Document id=$DocumentId not found."
    }
    return $result.Trim()
}

function Invoke-StateTransition {
    <#
    .SYNOPSIS
        Atomically transitions a document to a new processing state, writes
        a ProcessingStatus record, and logs via Write-LegalLog.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $DatabasePath,
        [Parameter(Mandatory)] [int]    $DocumentId,
        [Parameter(Mandatory)] [string] $ToState,
        [Parameter(Mandatory)] [string] $AgentSource,
        [string] $ErrorMessage = '',
        [int]    $DurationMs   = 0
    )

    $fromState = Get-DocumentState -DatabasePath $DatabasePath -DocumentId $DocumentId
    Assert-ValidTransition -FromState $fromState -ToState $ToState

    $success    = if ($ToState -in @('FAILED','ROLLED_BACK')) { 0 } else { 1 }
    $errEscaped = $ErrorMessage -replace "'", "''"
    $agent      = $AgentSource  -replace "'", "''"

    $sql = @"
BEGIN;
UPDATE Documents
   SET processing_state = '$ToState',
       updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id = $DocumentId;

INSERT INTO ProcessingStatus (document_id, from_state, to_state, agent, success, error_message, duration_ms)
VALUES ($DocumentId, '$fromState', '$ToState', '$agent', $success, '$errEscaped', $DurationMs);
COMMIT;
"@

    if (-not (Get-Command sqlite3 -ErrorAction SilentlyContinue)) {
        throw 'sqlite3 CLI not available.'
    }

    $sqlFile = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -Path $sqlFile -Value $sql -Encoding UTF8
        sqlite3 $DatabasePath ".read `"$sqlFile`""
        if ($LASTEXITCODE -ne 0) {
            throw "State transition SQL failed (exit $LASTEXITCODE)."
        }
    } finally {
        Remove-Item -Path $sqlFile -Force -ErrorAction SilentlyContinue
    }

    Write-LegalLog -Message "State transition: doc=$DocumentId $fromState → $ToState" `
                   -Level INFO `
                   -AgentSource $AgentSource `
                   -ResultState $ToState `
                   -Category system
}

Export-ModuleMember -Function Assert-ValidTransition, Get-DocumentState, Invoke-StateTransition
