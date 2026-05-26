#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL Pipeline Step 11 — Per-Case Workspace Launcher

.DESCRIPTION
    Accepts a case ID, retrieves the case from the local SQLite database, opens
    the corresponding folder in Windows Explorer, and navigates the firm dashboard
    in the default browser to that specific case — pre-filtered and ready to work.

    If the case carries registry_status = 'manual_review_required', a prominent
    warning is displayed and the user is directed to the MANUAL_REVIEW_REQUIRED
    triage view in the dashboard.

.PARAMETER CaseId
    The integer primary key of the case in the Cases table.

.PARAMETER DbPath
    Path to the Factum IL SQLite database. Defaults to $Script:FactumIL_DBPath.

.EXAMPLE
    .\11-Open-Workspace.ps1 -CaseId 42

.EXAMPLE
    .\11-Open-Workspace.ps1 -CaseId 42 -DbPath "C:\custom\factum-il.db"

.NOTES
    Requires PSSQLite module OR System.Data.SQLite.dll (same as 04-Parse-Identifiers.ps1).
    Dot-sources lib\Config.ps1 for path constants.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [int]$CaseId,

    [string]$DbPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
#  Bootstrap
# ─────────────────────────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$libDir    = Join-Path (Split-Path -Parent $scriptDir) 'lib'

$configPath = Join-Path $libDir 'Config.ps1'
if (Test-Path $configPath) { . $configPath } else {
    Write-Warning "[11-Open-Workspace] Config.ps1 not found at $configPath"
}

if ([string]::IsNullOrEmpty($DbPath)) {
    if ($Script:FactumIL_DBPath) {
        $DbPath = $Script:FactumIL_DBPath
    } else {
        throw '[11-Open-Workspace] $DbPath not provided and $Script:FactumIL_DBPath is not set. Run Config.ps1 first.'
    }
}

if (-not (Test-Path $DbPath)) {
    throw "[11-Open-Workspace] Database not found: $DbPath"
}

# ─────────────────────────────────────────────────────────────────────────────
#  SQLite query helpers (mirrors 04-Parse-Identifiers.ps1 pattern)
# ─────────────────────────────────────────────────────────────────────────────
$usePSSQLite = $false
if (Get-Module -ListAvailable -Name PSSQLite -ErrorAction SilentlyContinue) {
    Import-Module PSSQLite -ErrorAction Stop
    $usePSSQLite = $true
}

$conn = $null
if (-not $usePSSQLite) {
    $dllPaths = @(
        "$env:ProgramFiles\System.Data.SQLite\System.Data.SQLite.dll",
        (Join-Path (Split-Path -Parent (Split-Path -Parent $scriptDir)) 'tools\System.Data.SQLite.dll')
    )
    foreach ($dll in $dllPaths) {
        if (Test-Path $dll) {
            Add-Type -Path $dll
            $conn = [System.Data.SQLite.SQLiteConnection]::new("Data Source=$DbPath;Version=3;ReadOnly=True;")
            $conn.Open()
            break
        }
    }
    if (-not $conn) {
        throw '[11-Open-Workspace] Neither PSSQLite nor System.Data.SQLite.dll found.'
    }
}

function Get-CaseRow {
    $sql = @'
SELECT id, case_number, title_he, status, court_name,
       opened_date, statute_deadline, procedure_type,
       registry_status, client_id
  FROM Cases
 WHERE id = @Id
 LIMIT 1
'@
    if ($usePSSQLite) {
        return Invoke-SqliteQuery -DataSource $DbPath -Query $sql -SqlParameters @{ '@Id' = $CaseId }
    }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    [void]$cmd.Parameters.AddWithValue('@Id', $CaseId)
    $reader = $cmd.ExecuteReader()
    $row    = $null
    if ($reader.Read()) {
        $row = @{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $row[$reader.GetName($i)] = if ($reader.IsDBNull($i)) { $null } else { $reader.GetValue($i) }
        }
    }
    $reader.Close()
    return $row
}

# ─────────────────────────────────────────────────────────────────────────────
#  Read server_config.json for the API port
# ─────────────────────────────────────────────────────────────────────────────
function Get-ApiPort {
    $configLocations = @(
        (Join-Path $env:LOCALAPPDATA 'FactumIL\runtime\server_config.json'),
        (Join-Path $env:APPDATA      'FactumIL\runtime\server_config.json')
    )
    foreach ($path in $configLocations) {
        if (Test-Path $path) {
            try {
                $cfg = Get-Content $path -Raw | ConvertFrom-Json
                if ($cfg.port -and $cfg.port -gt 0) { return $cfg.port }
            } catch { }
        }
    }
    return 3001   # default
}

# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────
try {
    $case = Get-CaseRow

    if (-not $case -or ($case -isnot [hashtable] -and -not $case.id)) {
        Write-Error "[11-Open-Workspace] Case $CaseId not found in database."
        exit 1
    }

    $caseNumber      = [string]$case['case_number']
    $titleHe         = [string]$case['title_he']
    $registryStatus  = if ($case['registry_status'] -is [DBNull] -or $null -eq $case['registry_status']) { '' } else { [string]$case['registry_status'] }
    $statuteDeadline = if ($case['statute_deadline'] -is [DBNull] -or $null -eq $case['statute_deadline']) { '' } else { [string]$case['statute_deadline'] }

    Write-Host "`n[11-Open-Workspace] ─────────────────────────────────────" -ForegroundColor Cyan
    Write-Host "  תיק   : $caseNumber" -ForegroundColor White
    Write-Host "  כותרת : $titleHe"   -ForegroundColor White
    if ($statuteDeadline) {
        Write-Host "  התיישנות: $statuteDeadline" -ForegroundColor Yellow
    }

    # Alert if manual review required
    if ($registryStatus -eq 'manual_review_required') {
        Write-Host ''
        Write-Host '  ⚠  MANUAL_REVIEW_REQUIRED' -ForegroundColor Red
        Write-Host '     סוג תיק זה לא נמצא ברשימת הרישום הנורמטיבי.' -ForegroundColor Red
        Write-Host '     יש לסווג ידנית ולאמת את סוג ההליך.' -ForegroundColor Red
        Write-Host ''
    }

    # 1. Open case folder in Windows Explorer
    $legalRoot   = if ($Script:FactumIL_Root) { $Script:FactumIL_Root } else { 'C:\' }
    $caseFolder  = Join-Path $legalRoot "Legal\$caseNumber"

    if (Test-Path $caseFolder) {
        Write-Host "  פותח תיקייה: $caseFolder" -ForegroundColor Cyan
        Start-Process 'explorer.exe' -ArgumentList $caseFolder
    } else {
        Write-Warning "[11-Open-Workspace] Case folder not found: $caseFolder"
    }

    # 2. Launch dashboard pre-filtered to this case
    $port        = Get-ApiPort
    $dashboardUrl = if ($registryStatus -eq 'manual_review_required') {
        "http://localhost:$port/?view=cases&registry_status=manual_review_required&caseId=$CaseId"
    } else {
        "http://localhost:$port/?caseId=$CaseId"
    }

    Write-Host "  פותח דשבורד: $dashboardUrl" -ForegroundColor Cyan
    Start-Process $dashboardUrl

    Write-Host "`n[11-Open-Workspace] ✓ סביבת עבודה נפתחה לתיק $caseNumber" -ForegroundColor Green

} finally {
    if ($conn -and $conn -is [System.Data.SQLite.SQLiteConnection]) {
        $conn.Close()
        $conn.Dispose()
    }
}
