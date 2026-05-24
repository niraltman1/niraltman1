#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL Pipeline Step 04 — Parse & Classify Case Identifiers

.DESCRIPTION
    Reads case records from the SQLite database whose procedure_type or
    case_type has not yet been resolved from a parsed identifier, runs them
    through IdentifierParser.ps1, and writes the classified values back.

    CLASSIFICATION RULES (enforced by IdentifierParser.ps1):
      · Prefix "ת"א" → CaseType = 'civil'  (NEVER a location/city)
      · Procedure code '32' → ProcedureType = 'civil_standard' (STRICT)

    Run order in the pipeline:
      01-CreateFolderStructure.ps1
      01-SystemCheck.ps1
      02-SetupAIModels.ps1
      03-...  (future step)
      04-Parse-Identifiers.ps1   ← THIS SCRIPT
      ...

.PARAMETER DbPath
    Path to the Factum IL SQLite database file.
    Defaults to $Script:FactumIL_DBPath from Config.ps1.

.PARAMETER DryRun
    If specified, prints proposed changes without writing to the database.

.EXAMPLE
    # Standard pipeline invocation
    .\04-Parse-Identifiers.ps1

.EXAMPLE
    # Preview changes without committing
    .\04-Parse-Identifiers.ps1 -DryRun

.NOTES
    Requires:
      - PSSQLite module  (Install-Module PSSQLite) OR
      - System.Data.SQLite.dll on the assembly path
    Dot-sources lib\IdentifierParser.ps1 and lib\Config.ps1.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$DbPath = '',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
#  Bootstrap: load Config + IdentifierParser
# ─────────────────────────────────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$libDir    = Join-Path (Split-Path -Parent $scriptDir) 'lib'

$configPath = Join-Path $libDir 'Config.ps1'
if (Test-Path $configPath) { . $configPath } else {
    Write-Warning "[04-Parse-Identifiers] Config.ps1 not found at $configPath"
}

$parserPath = Join-Path $libDir 'IdentifierParser.ps1'
if (-not (Test-Path $parserPath)) {
    throw "[04-Parse-Identifiers] IdentifierParser.ps1 not found at $parserPath"
}
. $parserPath

# Resolve DB path
if ([string]::IsNullOrEmpty($DbPath)) {
    if ($Script:FactumIL_DBPath) {
        $DbPath = $Script:FactumIL_DBPath
    } else {
        throw '[04-Parse-Identifiers] $DbPath not provided and $Script:FactumIL_DBPath is not set. Run Config.ps1 first.'
    }
}

if (-not (Test-Path $DbPath)) {
    throw "[04-Parse-Identifiers] Database not found: $DbPath"
}

Write-Host "[04-Parse-Identifiers] Database : $DbPath" -ForegroundColor Cyan
Write-Host "[04-Parse-Identifiers] Dry run  : $($DryRun.IsPresent)" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
#  Load SQLite assembly
# ─────────────────────────────────────────────────────────────────────────────
function Open-SQLiteConnection {
    param([string]$Path)

    # Try PSSQLite (preferred)
    if (Get-Module -ListAvailable -Name PSSQLite -ErrorAction SilentlyContinue) {
        Import-Module PSSQLite -ErrorAction Stop
        return $null   # PSSQLite uses connection strings, not explicit connections
    }

    # Fallback: System.Data.SQLite
    $dllPaths = @(
        "$env:ProgramFiles\System.Data.SQLite\System.Data.SQLite.dll",
        (Join-Path $env:FACTUM_IL_ROOT 'tools\System.Data.SQLite.dll')
    )
    foreach ($dll in $dllPaths) {
        if (Test-Path $dll) {
            Add-Type -Path $dll
            $conn = [System.Data.SQLite.SQLiteConnection]::new("Data Source=$Path;Version=3;")
            $conn.Open()
            return $conn
        }
    }
    throw '[04-Parse-Identifiers] Neither PSSQLite nor System.Data.SQLite.dll found. Install-Module PSSQLite first.'
}

# ─────────────────────────────────────────────────────────────────────────────
#  Query helpers (abstracted over PSSQLite / raw connection)
# ─────────────────────────────────────────────────────────────────────────────
function Invoke-SQLiteQuery {
    param([string]$Query, [hashtable]$Params = @{}, $Connection)

    if (Get-Module PSSQLite -ErrorAction SilentlyContinue) {
        return Invoke-SqliteQuery -DataSource $DbPath -Query $Query -SqlParameters $Params
    }

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Query
    foreach ($kv in $Params.GetEnumerator()) {
        [void]$cmd.Parameters.AddWithValue($kv.Key, $kv.Value)
    }
    $reader  = $cmd.ExecuteReader()
    $results = [System.Collections.Generic.List[hashtable]]::new()
    while ($reader.Read()) {
        $row = @{}
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $row[$reader.GetName($i)] = $reader.GetValue($i)
        }
        $results.Add($row)
    }
    $reader.Close()
    return $results
}

function Invoke-SQLiteNonQuery {
    param([string]$Query, [hashtable]$Params = @{}, $Connection)

    if (Get-Module PSSQLite -ErrorAction SilentlyContinue) {
        Invoke-SqliteQuery -DataSource $DbPath -Query $Query -SqlParameters $Params | Out-Null
        return
    }

    $cmd = $Connection.CreateCommand()
    $cmd.CommandText = $Query
    foreach ($kv in $Params.GetEnumerator()) {
        [void]$cmd.Parameters.AddWithValue($kv.Key, $kv.Value)
    }
    [void]$cmd.ExecuteNonQuery()
}

# ─────────────────────────────────────────────────────────────────────────────
#  Main pipeline logic
# ─────────────────────────────────────────────────────────────────────────────
$conn = Open-SQLiteConnection -Path $DbPath

try {
    # Fetch cases that need identifier parsing:
    #   - case_number is not empty (we need a prefix to parse)
    #   - procedure_type is NULL or the generic 'civil' (may need refinement)
    #     OR procedure_code is set (code 32 must force civil_standard)
    $selectSql = @'
SELECT id, case_number, case_type, procedure_type, procedure_code
FROM   Cases
WHERE  case_number IS NOT NULL
  AND  case_number != ''
  AND  (
         procedure_type IS NULL
      OR procedure_code IS NOT NULL
  )
ORDER  BY id
'@

    $rows = Invoke-SQLiteQuery -Query $selectSql -Connection $conn

    $total    = 0
    $updated  = 0
    $skipped  = 0
    $warnings = 0

    foreach ($row in $rows) {
        $total++

        $caseId        = $row['id']
        $caseNumber    = [string]$row['case_number']
        $procedureCode = if ($row['procedure_code'] -is [DBNull]) { '' } else { [string]$row['procedure_code'] }

        # Parse the identifier
        $parsed = Parse-CaseIdentifier -RawIdentifier $caseNumber -ProcedureCode $procedureCode

        if ($parsed.ParseWarnings.Count -gt 0) {
            foreach ($w in $parsed.ParseWarnings) {
                Write-Warning "  [ID $caseId] $w"
            }
            $warnings += $parsed.ParseWarnings.Count
        }

        if (-not $parsed.IsValid) {
            $skipped++
            continue
        }

        $newCaseType      = $parsed.CaseType
        $newProcedureType = $parsed.ProcedureType

        $changeDesc = "case_type='$newCaseType'  procedure_type='$newProcedureType'"

        if ($DryRun) {
            Write-Host "  [DRY-RUN] Case $caseId ($caseNumber) → $changeDesc" -ForegroundColor Yellow
            $updated++
            continue
        }

        # Write classification back to DB
        $updateSql = @'
UPDATE Cases
SET    case_type      = @CaseType,
       procedure_type = @ProcedureType,
       updated_at     = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE  id = @Id
'@

        Invoke-SQLiteNonQuery -Query $updateSql -Connection $conn -Params @{
            '@CaseType'      = $newCaseType
            '@ProcedureType' = $newProcedureType
            '@Id'            = $caseId
        }

        Write-Verbose "  Updated case $caseId ($caseNumber) → $changeDesc"
        $updated++
    }

} finally {
    if ($conn -and $conn -is [System.Data.SQLite.SQLiteConnection]) {
        $conn.Close()
        $conn.Dispose()
    }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Summary report
# ─────────────────────────────────────────────────────────────────────────────
$dryLabel = if ($DryRun) { ' [DRY-RUN — no changes written]' } else { '' }

Write-Host "`n[04-Parse-Identifiers] Complete$dryLabel" -ForegroundColor Green
Write-Host "  Total rows examined : $total"
Write-Host "  Classifications applied : $updated"
Write-Host "  Skipped (unparseable)   : $skipped"
Write-Host "  Parse warnings raised   : $warnings"
Write-Host ""
Write-Host "  Classification rules applied:" -ForegroundColor Cyan
Write-Host '    ת"א prefix → case_type = civil  (NOT a location/city)'
Write-Host '    Procedure code 32 → procedure_type = civil_standard (סדר דין רגיל)'
