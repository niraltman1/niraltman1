#Requires -Version 5.1
<#
.SYNOPSIS
  Factum IL — Global configuration for Altman Law Office (אלטמן משרד עורכי דין).
  Dot-sourced by FactumIL.psm1 before all other modules.
  All path constants are defined here; modules must never hard-code paths.
#>

# ─────────────────────────────────────────────────────────────────────────────
#  Branded office root
# ─────────────────────────────────────────────────────────────────────────────

$Script:FactumIL_OfficeName = 'אלטמן משרד עורכי דין - סדר 2026'
$Script:FactumIL_Root       = "C:\$Script:FactumIL_OfficeName"

# ─────────────────────────────────────────────────────────────────────────────
#  Sub-folder structure under the branded root
# ─────────────────────────────────────────────────────────────────────────────

$Script:FactumIL_SubFolders = [ordered]@{
  Legal       = "$Script:FactumIL_Root\Legal"
  Medical     = "$Script:FactumIL_Root\Medical"
  Reports     = "$Script:FactumIL_Root\_Reports"
  Archive     = "$Script:FactumIL_Root\_Archive"
  Inbox       = "$Script:FactumIL_Root\_Inbox"
  Quarantine  = "$Script:FactumIL_Root\_Quarantine"
  Logs        = "$Script:FactumIL_Root\_Logs"
}

$Script:FactumIL_QuarantineDir = $Script:FactumIL_SubFolders['Quarantine']
$Script:FactumIL_InboxDir      = $Script:FactumIL_SubFolders['Inbox']

# ─────────────────────────────────────────────────────────────────────────────
#  Watch folders — monitored for new incoming documents
# ─────────────────────────────────────────────────────────────────────────────

$Script:WatchFolders = @(
  [System.IO.Path]::Combine($env:USERPROFILE, 'Downloads'),
  [System.IO.Path]::Combine($env:USERPROFILE, 'Documents')
)

# Human-readable folder labels for UI source attribution
$Script:WatchFolderLabels = @{
  [System.IO.Path]::Combine($env:USERPROFILE, 'Downloads') = 'תיקיית הורדות'
  [System.IO.Path]::Combine($env:USERPROFILE, 'Documents') = 'תיקיית מסמכים'
}

# ─────────────────────────────────────────────────────────────────────────────
#  Database & log paths (override via -InstallPath in START-HERE.ps1)
# ─────────────────────────────────────────────────────────────────────────────

$Script:FactumIL_DataDir  = "$Script:FactumIL_Root\_Data"
$Script:FactumIL_DBPath   = "$Script:FactumIL_DataDir\factum-il.db"
$Script:FactumIL_LogDir   = "$Script:FactumIL_SubFolders['Logs']"

# ─────────────────────────────────────────────────────────────────────────────
#  Helper — get label for a source path
# ─────────────────────────────────────────────────────────────────────────────

function Get-WatchFolderLabel {
  [OutputType([string])]
  param([string]$Path)
  foreach ($kv in $Script:WatchFolderLabels.GetEnumerator()) {
    if ($Path.StartsWith($kv.Key, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $kv.Value
    }
  }
  return 'ידני'
}

Export-ModuleMember -Function 'Get-WatchFolderLabel' -Variable @(
  'FactumIL_OfficeName','FactumIL_Root','FactumIL_SubFolders',
  'FactumIL_QuarantineDir','FactumIL_InboxDir','WatchFolders','WatchFolderLabels',
  'FactumIL_DataDir','FactumIL_DBPath','FactumIL_LogDir'
)
