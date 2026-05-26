#Requires -Version 5.1
<#
.SYNOPSIS
    Structured logging module for Factum IL.
    Writes UTF-8 log files in JSONL format with RFC-3339 timestamps.
#>
Set-StrictMode -Version Latest

$Script:LoggerConfig = @{
    LogDirectory = ''
    MinLevel     = 'INFO'
    EnableConsole = $true
    MaxFileSizeBytes = 10MB
    RotateAfterDays  = 30
}

$Script:LevelOrder = @{ DEBUG = 0; INFO = 1; WARN = 2; ERROR = 3; FATAL = 4 }

function Initialize-Logger {
    <#
    .SYNOPSIS
        Configures the logger.  Must be called before Write-LegalLog.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $LogDirectory,
        [ValidateSet('DEBUG','INFO','WARN','ERROR','FATAL')] [string] $MinLevel = 'INFO',
        [switch] $DisableConsole
    )

    if (-not (Test-Path $LogDirectory)) {
        New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    }

    $Script:LoggerConfig.LogDirectory   = $LogDirectory
    $Script:LoggerConfig.MinLevel       = $MinLevel
    $Script:LoggerConfig.EnableConsole  = -not $DisableConsole
}

function Get-LogPath {
    <#
    .SYNOPSIS
        Returns the path to today's log file for a given category.
    #>
    param(
        [ValidateSet('system','ocr','ai','migration','rollback','installer')] [string] $Category = 'system'
    )
    $date = Get-Date -Format 'yyyyMMdd'
    Join-Path $Script:LoggerConfig.LogDirectory "${Category}_${date}.jsonl"
}

function Write-LegalLog {
    <#
    .SYNOPSIS
        Writes a structured log entry.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Message,
        [ValidateSet('DEBUG','INFO','WARN','ERROR','FATAL')] [string] $Level = 'INFO',
        [ValidateSet('system','ocr','ai','migration','rollback','installer')] [string] $Category = 'system',
        [string] $OperationId = '',
        [string] $AgentSource = '',
        [string] $FileHash    = '',
        [string] $ResultState = '',
        [hashtable] $Extra    = @{}
    )

    if ($Script:LoggerConfig.LogDirectory -eq '') {
        # Auto-init to temp if not configured
        Initialize-Logger -LogDirectory (Join-Path $env:TEMP 'FactumIL\logs')
    }

    $configuredLevel = $Script:LevelOrder[$Script:LoggerConfig.MinLevel]
    $entryLevel      = $Script:LevelOrder[$Level]
    if ($entryLevel -lt $configuredLevel) { return }

    $entry = [ordered]@{
        timestamp   = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss.fffZ')
        level       = $Level
        category    = $Category
        message     = $Message
        operationId = $OperationId
        agentSource = $AgentSource
        fileHash    = $FileHash
        resultState = $ResultState
    }
    foreach ($key in $Extra.Keys) { $entry[$key] = $Extra[$key] }

    $json    = $entry | ConvertTo-Json -Compress -Depth 5
    $logPath = Get-LogPath -Category $Category

    try {
        # Rotate if file exceeds max size
        if ((Test-Path $logPath) -and (Get-Item $logPath).Length -gt $Script:LoggerConfig.MaxFileSizeBytes) {
            $archive = $logPath -replace '\.jsonl$', "_archive_$(Get-Date -Format 'HHmmss').jsonl"
            Move-Item -Path $logPath -Destination $archive -Force
        }
        Add-Content -Path $logPath -Value $json -Encoding UTF8
    } catch {
        Write-Warning "[Logger] Failed to write log entry: $_"
    }

    if ($Script:LoggerConfig.EnableConsole) {
        $color = switch ($Level) {
            'DEBUG' { 'Gray'    }
            'INFO'  { 'Cyan'    }
            'WARN'  { 'Yellow'  }
            'ERROR' { 'Red'     }
            'FATAL' { 'DarkRed' }
            default { 'White'   }
        }
        Write-Host "[$Level] $Message" -ForegroundColor $color
    }
}

Export-ModuleMember -Function Initialize-Logger, Write-LegalLog, Get-LogPath
