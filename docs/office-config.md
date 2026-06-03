# Office Configuration — Factum-IL v1.0.0

## Branded Root Path

All managed documents are stored under a single branded root:

```
C:\אלטמן משרד עורכי דין - סדר 2026\
```

This path is defined in `powershell/lib/Config.ps1` as `$Script:FactumIL_Root` and is also read from the `FACTUM_IL_ROOT` environment variable (set by the installer in the registry).

---

## Sub-folder Structure

| Key | Path | Purpose |
|-----|------|---------|
| `Legal` | `…\Legal\` | Legal case documents |
| `Medical` | `…\Medical\` | Blocked by Data Firewall — never used by the pipeline |
| `Reports` | `…\_Reports\` | Generated reports and exports |
| `Archive` | `…\_Archive\` | Archived completed cases |
| `Inbox` | `…\_Inbox\` | Manual drop zone for intake |
| `Quarantine` | `…\_Quarantine\` | Files blocked by Data Firewall or failed validation |
| `Logs` | `…\_Logs\` | PowerShell pipeline logs |
| _(data dir)_ | `…\_Data\` | SQLite databases (`factum-il.db`, `_data.db`) |

**Note:** The `Medical` folder exists in the filesystem structure but is permanently blocked by the Data Firewall (`EXCLUDED_PATTERNS`). No file from this folder will be processed by the legal pipeline.

---

## WatchFolders

The system monitors two default source folders for new documents:

| Label | Path |
|-------|------|
| `תיקיית הורדות` | `%USERPROFILE%\Downloads` |
| `תיקיית מסמכים` | `%USERPROFILE%\Documents` |

These are set in `$Script:WatchFolders` and `$Script:WatchFolderLabels` in `Config.ps1`.

Additional watch directories can be added at runtime via:
```
POST /api/admin/watcher/watch { "directory": "C:\\path\\to\\dir" }
```

---

## Bootstrap Script

`powershell/scripts/01-CreateFolderStructure.ps1` is idempotent:

1. Checks `Test-Path -LiteralPath $Script:FactumIL_Root`
2. If absent: creates root + all sub-folders + grants ACL (FullControl, ContainerInherit + ObjectInherit)
3. Prints Hebrew success or "already exists" message
4. Called automatically from `START-HERE.ps1` before database initialisation

---

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

The root path (`C:\אלטמן משרד עורכי דין - סדר 2026\`) requires administrator rights to create (done once by the installer). Subsequent writes use the ACL granted to the current user.

---

## Database Location

```
C:\אלטמן משרד עורכי דין - סדר 2026\_Data\factum-il.db   ← primary database
C:\אלטמן משרד עורכי דין - סדר 2026\_Data\_data.db       ← chunks and embeddings
```

These paths are configured in `Config.ps1` as `$Script:FactumIL_DBPath` and `$Script:FactumIL_DataPath`, and are also set by the registry variables `FACTUM_IL_DB_PATH` and `FACTUM_IL_DATA_PATH`.

---

## Config.ps1 — Key Variables

| Variable | Value |
|----------|-------|
| `$Script:FactumIL_Root` | `C:\אלטמן משרד עורכי דין - סדר 2026\` |
| `$Script:FactumIL_DBPath` | `$Script:FactumIL_Root\_Data\factum-il.db` |
| `$Script:FactumIL_DataPath` | `$Script:FactumIL_Root\_Data\_data.db` |
| `$Script:WatchFolders` | `@("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Documents")` |
| `$Script:OllamaBaseUrl` | `http://127.0.0.1:11434` (or `$env:OLLAMA_BASE_URL`) |
| `$Script:OllamaModel` | `BrainboxAI/law-il-E2B:Q4_K_M` (or `$env:OLLAMA_MODEL`) |

---

## Windows Path Constraints

All PowerShell scripts use `-LiteralPath` exclusively — no glob expansion. This ensures Hebrew directory names with spaces and special characters work correctly.

The `ApiHostService.cs` (desktop shell) reads the above paths from registry environment variables and passes them to the Node.js API process via `ProcessStartInfo.EnvironmentVariables`. This means the Node.js process always receives the correct paths regardless of the system user's environment.

---

## Uninstall Behaviour

The Inno Setup uninstaller removes application files but **does not delete user data**:

- `C:\אלטמן משרד עורכי דין - סדר 2026\_Data\` — preserved (databases)
- `C:\אלטמן משרד עורכי דין - סדר 2026\_Logs\` — preserved (logs)
- `C:\אלטמן משרד עורכי דין - סדר 2026\Legal\` — preserved (documents)
- `%LOCALAPPDATA%\FactumIL\backups\` — preserved (encrypted backups)

Registry environment variables written by the installer are removed on uninstall.
