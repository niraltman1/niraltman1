#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL root PowerShell module.  Dot-sources all sub-modules.
#>
Set-StrictMode -Version Latest

# Load global config first — all modules may reference $Script:FactumIL_Root etc.
$configPath = Join-Path $PSScriptRoot 'lib\Config.ps1'
if (Test-Path $configPath) { . $configPath }

# Load identifier parser — Parse-CaseIdentifier, Get-CaseTypeFromPrefix, Get-ProcedureTypeFromCode
$parserPath = Join-Path $PSScriptRoot 'lib\IdentifierParser.ps1'
if (Test-Path $parserPath) { . $parserPath }

$moduleRoot = $PSScriptRoot
$subModules = @(
    'modules\Logger.psm1',
    'modules\HashValidator.psm1',
    'modules\StateMachine.psm1',
    'modules\ActionLog.psm1',
    'modules\ManifestSnapshot.psm1',
    'modules\LockManager.psm1',
    'modules\QueueManager.psm1',
    'modules\OCRProcessor.psm1',
    'modules\CrashRecovery.psm1',
    'modules\Supervisor.psm1',
    'modules\FileWatcher.psm1'
)

foreach ($sub in $subModules) {
    $path = Join-Path $moduleRoot $sub
    if (Test-Path $path) {
        # Use Import-Module -Global so each sub-module's exports land in the
        # global session state.  Dot-sourcing + Export-ModuleMember only
        # propagates to the root module scope, which Pester 5 isolates per
        # scriptblock and therefore cannot see from inner BeforeAll/It blocks.
        Import-Module $path -Force -Global
    } else {
        Write-Warning "[FactumIL] Sub-module not found: $path"
    }
}
