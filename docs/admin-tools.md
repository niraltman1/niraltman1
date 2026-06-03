# Operational Admin Tools — Factum-IL v1.0.0

## Overview

The `/admin` dashboard page provides system operators with diagnostic visibility and repair capabilities without requiring direct database access. **All admin endpoints require the `admin` role** (RBAC enforced via `packages/policy-engine`).

---

## Dashboard Sections

### Worker Health (`/api/admin/workers`)

Live grid of all registered workers sourced from `WorkerHealth`:

| Column | Meaning |
|--------|---------|
| מזהה (ID) | First 8 chars of UUID — unique worker identity |
| סוג (Type) | rag / watcher / backup / update / fts-heal / queue |
| מצב (Status) | idle / busy / stopping / dead |
| זיכרון (Memory) | RSS memory in MB at last heartbeat |
| משימות (Tasks) | Completed / failed count |

Status colours: green=idle, gold=busy, yellow=stopping, red=dead.

Refreshes every 5 seconds. **All workers show as stopped when `FACTUM_IL_SAFE_MODE=1`.**

### Watcher Events (`/api/admin/watcher/events`)

Log of the last 30 file system events from `WatcherEvents`, showing:
- Timestamp
- Status badge: `הועבר לתור` (queued), `כפול` (duplicate), or `חסום` (blocked by Data Firewall)
- File name
- Error message if dispatch failed

### Backup Snapshots (`/api/admin/backups`)

Lists all backup entries from `BackupSnapshots` with:
- Backup file name + path
- Size (MB) + document count at time of backup
- Creation date
- Encryption status (AES-256-GCM when `BACKUP_ENCRYPT=1`)
- Integrity indicator: green check (ok), red warning (error), clock (unchecked)

**Create Backup** button: `POST /api/admin/backups`

---

## Repair Endpoints

All repair endpoints require the `admin` role. They can run while the system is live but are safer under `FACTUM_IL_SAFE_MODE=1`.

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/admin/repair/fts` | POST | Rebuilds all FTS5 virtual tables (`fts_documents`, `fts_clients`, etc.) |
| `/api/admin/repair/rag` | POST | Resets `ai_enriched = 0` for all documents; triggers RAG re-enrichment on next cycle |
| `/api/admin/repair/manifest` | POST | Runs manifest reconciliation — resets orphaned documents to DISCOVERED |
| `/api/admin/repair/integrity` | POST | Runs `PRAGMA integrity_check` + `PRAGMA foreign_key_check` on both DB files |
| `/api/admin/repair/replay` | POST | Replays `INTERRUPTED` entries in `TransactionJournal` |

---

## Recovery Endpoints

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/recovery/status` | GET | System health: worker states, queue depth, lock count, last backup |
| `/api/recovery/agents` | GET | Active agent executions — shows `AGENT_BUSY` locks |
| `/api/recovery/pipeline` | GET | Documents in non-terminal states (OCR_PENDING, CLASSIFIED, FAILED) |
| `/api/recovery/clear-locks` | POST | Releases all expired locks in `Locks` table; admin-only |

---

## Full Admin API Reference

```
GET  /api/admin/workers                    → WorkerHealth[]
GET  /api/admin/watcher/events?limit       → WatcherEvents[]
GET  /api/admin/backups                    → BackupSnapshot[]
POST /api/admin/backups                    → { snapshotId: string }
POST /api/admin/repair/fts                 → { rebuilt: string[] }
POST /api/admin/repair/rag                 → { reset: number }
POST /api/admin/repair/manifest            → { reconciled: number }
POST /api/admin/repair/integrity           → { ok: boolean; errors: string[] }
POST /api/admin/repair/replay              → { replayed: number }
POST /api/admin/repair/replay/:id          → { itemId: string; requeuedAt: string }
GET  /api/recovery/status                  → SystemStatus
GET  /api/recovery/agents                  → AgentLock[]
GET  /api/recovery/pipeline                → DocumentStatusSummary
POST /api/recovery/clear-locks             → { released: number }
GET  /api/updates/check                    → { currentVersion: string; latestVersion: string; updateAvailable: boolean }
```

---

## File Watcher Configuration

```
GET  /api/admin/watcher              → { activeDirectories: string[]; debounceMs: number }
POST /api/admin/watcher/watch        → { directory: string }
POST /api/admin/watcher/unwatch      → { directory: string }
```

### Debounce

Default: **800ms**. Files are not processed until no write events have been received for 800ms.

### File Stability Check

After the debounce window, the watcher:
1. Reads file size twice with 300ms gap — must be identical
2. Attempts exclusive open to confirm no active writer

### Supported Extensions

`.pdf`, `.docx`, `.doc`, `.odt`, `.tiff`, `.tif`, `.png`, `.jpg`, `.jpeg`, `.mp3`, `.m4a`, `.opus`, `.ogg`, `.wav`

---

## Safe Mode

Set `FACTUM_IL_SAFE_MODE=1` in the registry (or as an environment variable) to disable all 6 background workers:

1. RAG worker
2. File watcher
3. Backup scheduler
4. Update scheduler
5. FTS healing service
6. Queue processor

The API server and dashboard remain fully functional in safe mode. Repair and recovery endpoints continue to work. Safe mode is the recommended state for running repair operations.

**To re-enable workers:** Set `FACTUM_IL_SAFE_MODE=0` in the registry and restart the server.

---

## Backup Restore Procedure

1. Stop all workers: set `FACTUM_IL_SAFE_MODE=1` and restart the server
2. Identify the target backup file in `BackupSnapshots`
3. If encrypted (`is_encrypted = 1`), prepare the `BACKUP_ENCRYPT_KEY` (64-char hex)
4. Run:
   ```powershell
   # Decrypt and restore (if encrypted)
   Restore-EncryptedBackup -BackupPath "C:\backups\factum-il-2026-06-03T10-00-00.db.enc" `
     -KeyHex $env:BACKUP_ENCRYPT_KEY `
     -OutputPath $env:FACTUM_IL_DB_PATH
   ```
5. Restart the server — the migration runner will validate the schema
6. Run `POST /api/admin/repair/fts` to rebuild FTS5 indexes after restore
7. Run `POST /api/admin/repair/rag` if you need to re-enrich documents
8. Set `FACTUM_IL_SAFE_MODE=0` and restart

---

## Recovery — Manual PowerShell

```powershell
Import-Module .\powershell\FactumIL.psd1

# Release stale locks + re-queue failed items
Invoke-QueueRecovery -DatabasePath $db

# Replay interrupted transaction journal entries
Invoke-FullRecovery -DatabasePath $db

# Repair manifest reconciliation
Invoke-ManifestReconciliation -DatabasePath $db

# Create PII-scrubbed crash bundle for support
New-CrashBundle -DatabasePath $db -OutputDir C:\factum-il\crash-reports
```

---

## Queue Requeue Endpoint

Poisoned items (exceeded max retries) can be manually requeued:

```
POST /api/queue/requeue/:itemId → { itemId: string; requeuedAt: string }
```

This resets `is_poisoned = 0`, `retry_count = 0`, `worker_id = NULL`, `next_retry_at = now()`.
