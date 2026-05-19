# Operational Admin Tools

## Overview

The `/admin` dashboard page provides system operators ("clerks") with diagnostic visibility and repair capabilities without requiring direct database access.

## Dashboard Sections

### Worker Health (`/api/admin/workers`)

Live grid of all registered workers sourced from `WorkerHealth`:

| Column         | Meaning                                              |
|----------------|------------------------------------------------------|
| מזהה (ID)       | First 8 chars of UUID — unique worker identity       |
| סוג (Type)      | ocr / classify / enrich / watcher / supervisor       |
| מצב (Status)    | idle / busy / stopping / dead                        |
| זיכרון (Memory) | RSS memory in MB at last heartbeat                   |
| משימות (Tasks)  | Completed / failed count                             |

Status colours: green=idle, gold=busy, yellow=stopping, red=dead.

Refreshes every 5 seconds.

### Watcher Events (`/api/admin/watcher/events`)

Log of the last 30 file system events from `WatcherEvents`, showing:
- Timestamp
- Status badge: `הועבר לתור` (queued), `כפול` (duplicate), or `זוהה` (detected only)
- File name
- Error message if dispatch failed

### Backup Snapshots (`/api/admin/backups`)

Lists all backup entries from `BackupSnapshots` with:
- Backup file name + path
- Size (MB) + document count at time of backup
- Creation date
- Integrity indicator: green check (ok), red warning (error), clock (unchecked)

**Create Backup** button: POST to `/api/admin/backups`

### Repair Tools

| Tool              | Endpoint                        | What it does                                              |
|-------------------|---------------------------------|-----------------------------------------------------------|
| תיקון מניפסט       | POST `/api/admin/repair/manifest` | Runs `Invoke-ManifestReconciliation` — resets orphaned documents to DISCOVERED |
| בדיקת שלמות DB    | POST `/api/admin/repair/integrity` | Runs `PRAGMA integrity_check` + `foreign_key_check`       |
| שחזור משימה       | POST `/api/admin/repair/replay/:id` | Re-enqueues a specific item by `item_id` with reset retry count |

## API Reference

All endpoints are served by the local API server (Express / Electron IPC bridge).

```
GET  /api/admin/workers               → WorkerHealth[]
GET  /api/admin/watcher/events?limit  → WatcherEvents[]
GET  /api/admin/backups               → BackupSnapshot[]
POST /api/admin/backups               → { snapshotId: string }
POST /api/admin/repair/manifest       → { reconciled: number }
POST /api/admin/repair/integrity      → { ok: boolean; errors: string[] }
POST /api/admin/repair/replay/:id     → { itemId: string; requeuedAt: string }
```

## File Watcher Configuration

The file watcher is configured in the installer and can be reconfigured via the admin API:

```
GET  /api/admin/watcher              → { activeDirectories: string[]; debounceMs: number }
POST /api/admin/watcher/watch        → { directory: string }
POST /api/admin/watcher/unwatch      → { directory: string }
```

### Debounce

Default: **800ms**. Files are not processed until no write events have been received for 800ms. This prevents processing partially-copied files.

### File Stability Check

After the debounce window, the watcher:
1. Reads file size twice with 300ms gap — must be identical
2. Attempts exclusive open to confirm no active writer

If either check fails, the event is dropped (it will fire again when the copy completes).

### Supported Extensions

`.pdf`, `.docx`, `.doc`, `.odt`, `.tiff`, `.tif`, `.png`, `.jpg`, `.jpeg`

## Recovery Procedures

For manual recovery, use PowerShell directly:

```powershell
Import-Module .\powershell\LegalOS.psd1

# Release stale locks + re-queue failed items
Invoke-QueueRecovery -DatabasePath $db

# Replay interrupted transaction journal entries
# (runs automatically on Invoke-FullRecovery)
Invoke-FullRecovery -DatabasePath $db

# Repair manifest reconciliation
Invoke-ManifestReconciliation -DatabasePath $db

# Create crash bundle for diagnostics
New-CrashBundle -DatabasePath $db -OutputDir C:\legal-os\crash-reports
```
