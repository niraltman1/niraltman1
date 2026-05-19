# Office Configuration

## Branded Root Path

All managed documents are stored under a single branded root:

```
C:\אלטמן משרד עורכי דין - סדר 2026\
```

This path is defined in `powershell/lib/Config.ps1` as `$Script:LegalOS_Root`.

## Sub-folder Structure

| Key | Path |
|-----|------|
| `Legal` | `…\Legal\` |
| `Medical` | `…\Medical\` |
| `Reports` | `…\_Reports\` |
| `Archive` | `…\_Archive\` |
| `Inbox` | `…\_Inbox\` |
| `Quarantine` | `…\_Quarantine\` |
| `Logs` | `…\_Logs\` |
| _(data dir)_ | `…\_Data\` ← SQLite DB lives here |

## WatchFolders

The system monitors two source folders for new documents:

| Label | Path |
|-------|------|
| `תיקיית הורדות` | `%USERPROFILE%\Downloads` |
| `תיקיית מסמכים` | `%USERPROFILE%\Documents` |

These are set in `$Script:WatchFolders` and `$Script:WatchFolderLabels` in `Config.ps1`.

## Bootstrap Script

`powershell/scripts/01-CreateFolderStructure.ps1` is idempotent:

1. Checks `Test-Path $Script:LegalOS_Root`
2. If absent: creates root + all sub-folders + grants ACL (FullControl, ContainerInherit + ObjectInherit)
3. Prints Hebrew success or "already exists" message
4. Called automatically from `START-HERE.ps1` before database initialisation

## ACL Requirements

Hebrew path names on Windows require an explicit ACL grant for the current user. The bootstrap script calls:

```powershell
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
  [System.Security.AccessControl.InheritanceFlags]::ObjectInherit,
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow
)
```

## Database Location

```
C:\אלטמן משרד עורכי דין - סדר 2026\_Data\legal-os.db
```

Defined as `$Script:LegalOS_DBPath` in `Config.ps1`.
