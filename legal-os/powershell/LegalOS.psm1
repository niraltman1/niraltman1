#Requires -Version 5.1
<#
.SYNOPSIS
    Legal-OS root PowerShell module.  Dot-sources all sub-modules.
#>
Set-StrictMode -Version Latest

# Load global config first — all modules may reference $Script:LegalOS_Root etc.
$configPath = Join-Path $PSScriptRoot 'lib\Config.ps1'
if (Test-Path $configPath) { . $configPath }

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
        . $path
    } else {
        Write-Warning "[LegalOS] Sub-module not found: $path"
    }
}
