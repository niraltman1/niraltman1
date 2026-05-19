#Requires -Version 5.1
<#
.SYNOPSIS
  Creates (or verifies) the branded Altman Law Office folder structure under
  C:\אלטמן משרד עורכי דין - סדר 2026\.
  Idempotent — safe to run multiple times.
  Called by START-HERE.ps1 and by Initialize-Supervisor on first run.
#>
[CmdletBinding()]
param(
  [string] $DatabasePath = $Script:LegalOS_DBPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
#  Ensure Config is available
# ─────────────────────────────────────────────────────────────────────────────
if (-not (Get-Variable -Name 'LegalOS_Root' -Scope Script -ErrorAction SilentlyContinue)) {
  $configPath = Join-Path $PSScriptRoot '..\lib\Config.ps1'
  . $configPath
}

# ─────────────────────────────────────────────────────────────────────────────
#  Create root directory
# ─────────────────────────────────────────────────────────────────────────────

$rootCreated = $false
if (-not (Test-Path $Script:LegalOS_Root -PathType Container)) {
  New-Item -ItemType Directory -Path $Script:LegalOS_Root -Force | Out-Null

  # Grant current user full control (required for Hebrew path on some Windows configs)
  $acl  = Get-Acl $Script:LegalOS_Root
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $acl.SetAccessRule($rule)
  Set-Acl -Path $Script:LegalOS_Root -AclObject $acl

  $rootCreated = $true
  Write-Host "[Legal-OS] נוצרה תיקיית שורש: $Script:LegalOS_Root" -ForegroundColor Green
} else {
  Write-Host "[Legal-OS] תיקיית שורש קיימת: $Script:LegalOS_Root" -ForegroundColor Cyan
}

# ─────────────────────────────────────────────────────────────────────────────
#  Create sub-folders
# ─────────────────────────────────────────────────────────────────────────────

foreach ($entry in $Script:LegalOS_SubFolders.GetEnumerator()) {
  if (-not (Test-Path $entry.Value -PathType Container)) {
    New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
    Write-Host "[Legal-OS]   ↳ נוצרה תיקייה: $($entry.Value)" -ForegroundColor Green
  }
}

# ─────────────────────────────────────────────────────────────────────────────
#  Create Data dir (DB lives here, outside the document tree)
# ─────────────────────────────────────────────────────────────────────────────

if (-not (Test-Path $Script:LegalOS_DataDir -PathType Container)) {
  New-Item -ItemType Directory -Path $Script:LegalOS_DataDir -Force | Out-Null
}

# ─────────────────────────────────────────────────────────────────────────────
#  Print branded success message (The Clerk tone)
# ─────────────────────────────────────────────────────────────────────────────

if ($rootCreated) {
  Write-Host ''
  Write-Host '┌─────────────────────────────────────────────────────────────┐' -ForegroundColor DarkGray
  Write-Host "│  Legal-OS — אלטמן משרד עורכי דין                           │" -ForegroundColor Cyan
  Write-Host "│                                                             │" -ForegroundColor DarkGray
  Write-Host "│  התיקייה '$Script:LegalOS_OfficeName'  │" -ForegroundColor White
  Write-Host "│  נוצרה בהצלחה.                                              │" -ForegroundColor White
  Write-Host "│                                                             │" -ForegroundColor DarkGray
  Write-Host "│  המערכת מנטרת כעת מסמכים חדשים מ:                         │" -ForegroundColor White
  foreach ($wf in $Script:WatchFolders) {
    $label = Get-WatchFolderLabel -Path $wf
    Write-Host "│    • $label ($wf)" -ForegroundColor Yellow
  }
  Write-Host '└─────────────────────────────────────────────────────────────┘' -ForegroundColor DarkGray
  Write-Host ''
}

Write-Output $Script:LegalOS_Root
