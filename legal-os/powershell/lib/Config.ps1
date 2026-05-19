#Requires -Version 5.1
<#
.SYNOPSIS
  Legal-OS — Global configuration for Altman Law Office (אלטמן משרד עורכי דין).
  Dot-sourced by LegalOS.psm1 before all other modules.
  All path constants are defined here; modules must never hard-code paths.
#>

# ─────────────────────────────────────────────────────────────────────────────
#  Branded office root
# ─────────────────────────────────────────────────────────────────────────────

$Script:LegalOS_OfficeName = 'אלטמן משרד עורכי דין - סדר 2026'
$Script:LegalOS_Root       = "C:\$Script:LegalOS_OfficeName"

# ─────────────────────────────────────────────────────────────────────────────
#  Sub-folder structure under the branded root
# ─────────────────────────────────────────────────────────────────────────────

$Script:LegalOS_SubFolders = [ordered]@{
  Legal       = "$Script:LegalOS_Root\Legal"
  Medical     = "$Script:LegalOS_Root\Medical"
  Reports     = "$Script:LegalOS_Root\_Reports"
  Archive     = "$Script:LegalOS_Root\_Archive"
  Inbox       = "$Script:LegalOS_Root\_Inbox"
  Quarantine  = "$Script:LegalOS_Root\_Quarantine"
  Logs        = "$Script:LegalOS_Root\_Logs"
}

$Script:LegalOS_QuarantineDir = $Script:LegalOS_SubFolders['Quarantine']
$Script:LegalOS_InboxDir      = $Script:LegalOS_SubFolders['Inbox']

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

$Script:LegalOS_DataDir  = "$Script:LegalOS_Root\_Data"
$Script:LegalOS_DBPath   = "$Script:LegalOS_DataDir\legal-os.db"
$Script:LegalOS_LogDir   = "$Script:LegalOS_SubFolders['Logs']"

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
  'LegalOS_OfficeName','LegalOS_Root','LegalOS_SubFolders',
  'LegalOS_QuarantineDir','LegalOS_InboxDir','WatchFolders','WatchFolderLabels',
  'LegalOS_DataDir','LegalOS_DBPath','LegalOS_LogDir'
)
