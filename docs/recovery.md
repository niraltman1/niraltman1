# Factum-IL Recovery & Rollback Guide — v1.0.0

## Core Safety Guarantees

1. **Original files are never deleted** — only copies are moved to storage
2. **Every mutation is logged** in `ActionLog` with before/after hashes
3. **Every mutation is preceded** by a `ManifestSnapshot`
4. **All state transitions are atomic** — no partial states
5. **SHA-256 integrity is verified** before and after every file operation
6. **Encrypted backups run hourly** — AES-256-GCM via `packages/encrypted-backup`

---

## RecoveryWindow Endpoints

The RecoveryWindow provides a structured API for assessing and recovering system state. All endpoints require the `admin` role.

```
GET  /api/recovery/status       → SystemStatus (overall health snapshot)
GET  /api/recovery/agents       → AgentLock[] (active or stale agent locks)
GET  /api/recovery/pipeline     → DocumentStatusSummary (non-terminal document states)
POST /api/recovery/clear-locks  → { released: number } (release all expired Locks rows)
```

### Interpreting /api/recovery/status

```json
{
  "workers": { "running": 6, "dead": 0, "safeMode": false },
  "queue": { "depth": 0, "poisoned": 0 },
  "locks": { "active": 0, "expired": 0 },
  "lastBackup": "2026-06-03T10:00:00Z",
  "ftsOk": true,
  "dbIntegrity": "ok"
}
```

If `safeMode: true`, all workers are stopped and must be re-enabled via registry.

---

## Safe Mode Activation

Safe mode disables all 6 background workers without stopping the API server.

**Activate safe mode:**
```powershell
# Set registry value (takes effect on next server restart)
Set-ItemProperty -Path "HKCU:\Environment" -Name "FACTUM_IL_SAFE_MODE" -Value "1"
# Restart the API server
```

Or set `FACTUM_IL_SAFE_MODE=1` in the environment before starting the server.

**Deactivate safe mode:**
```powershell
Set-ItemProperty -Path "HKCU:\Environment" -Name "FACTUM_IL_SAFE_MODE" -Value "0"
# Restart the API server
```

**When to use safe mode:**
- Before running repair endpoints to avoid race conditions
- During database backup restore
- While investigating data integrity issues
- During forensic review of audit logs

---

## Post-Install Repair Audit Results

Based on the audit conducted on 2026-05-30, the following can be fixed **without reinstalling**:

| Component | Fixable without reinstall? | Method |
|-----------|---------------------------|--------|
| FTS5 index | Yes | `POST /api/admin/repair/fts` |
| RAG enrichment | Yes | `POST /api/admin/repair/rag` |
| Manifest orphans | Yes | `POST /api/admin/repair/manifest` |
| DB integrity | Yes (data issues) | `POST /api/admin/repair/integrity` + restore from backup |
| Transaction journal | Yes | `POST /api/admin/repair/replay` |
| `OLLAMA_BASE_URL` | Yes | Change registry value + restart |
| `SQLITE_VEC_PATH` | Yes | Change registry value + restart |
| Admin password | Yes | `POST /api/auth/change-password` or set `FACTUM_IL_ADMIN_PASS` |
| Node.js API routes | Yes | Reinstall only the API files (installer `ignoreversion` flag) |
| React frontend | Yes | Reinstall only the frontend files (installer `ignoreversion` flag) |
| `FACTUM_IL_VERSION` | Yes | Change registry value + restart |
| Code bugs (TypeScript) | No | Requires new installer run |
| sqlite-vec.dll missing | No | Requires new installer run (or manual DLL copy + registry set) |
| Binary corruption | No | Requires new installer run |

**Items that cannot be fixed without reinstalling:**
- Bugs in compiled TypeScript code
- Missing or corrupt `sqlite-vec.dll`
- Missing or corrupt `whisper-fast.exe` or `ffmpeg.exe`

---

## Crash Recovery

If the pipeline was interrupted (power loss, process kill, system crash):

### Step 1 — Activate Safe Mode

```powershell
Set-ItemProperty -Path "HKCU:\Environment" -Name "FACTUM_IL_SAFE_MODE" -Value "1"
# Restart server
```

### Step 2 — Check System Status

```
GET /api/recovery/status
```

### Step 3 — Clear Stale Locks

```
POST /api/recovery/clear-locks
```

Or via PowerShell:

```powershell
sqlite3 $dbPath "DELETE FROM Locks WHERE expires_at < datetime('now');"
```

### Step 4 — Identify Incomplete Operations

```sql
SELECT id, filename, processing_state, updated_at
  FROM Documents
 WHERE processing_state IN ('OCR_PENDING', 'CLASSIFIED', 'FAILED')
 ORDER BY updated_at DESC;
```

### Step 5 — Replay Interrupted Transactions

```
POST /api/admin/repair/replay
```

Or PowerShell:

```powershell
Invoke-FullRecovery -DatabasePath $db
```

### Step 6 — Reset FAILED Documents

```sql
UPDATE Documents
   SET processing_state = 'DISCOVERED',
       updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE processing_state = 'FAILED';
```

Or via state machine:

```powershell
Invoke-StateTransition -DatabasePath $dbPath -DocumentId 42 -ToState 'DISCOVERED' -AgentSource 'Recovery'
```

### Step 7 — Deactivate Safe Mode

```powershell
Set-ItemProperty -Path "HKCU:\Environment" -Name "FACTUM_IL_SAFE_MODE" -Value "0"
# Restart server
```

---

## Rolling Back a Single File Operation

```sql
SELECT id, operation_type, path_before, path_after, file_hash_before, logged_at
  FROM ActionLog
 WHERE document_id = 42
   AND is_reversible = 1
   AND rolled_back = 0
 ORDER BY logged_at DESC;
```

```powershell
Invoke-RollbackAction -DatabasePath $dbPath -ActionLogId 123 -AgentSource 'ManualRecovery'
```

This moves the file back to `path_before`, verifies the hash, marks the `ActionLog` entry `rolled_back = 1`, and inserts a compensating `ROLLBACK` entry.

---

## Backup Restore Procedure

### 1. Identify the backup

```sql
SELECT id, backup_path, created_at, is_encrypted, doc_count
  FROM BackupSnapshots
 ORDER BY created_at DESC
 LIMIT 10;
```

### 2. Activate safe mode and stop all workers

Set `FACTUM_IL_SAFE_MODE=1` and restart the server.

### 3. Restore the backup

**Unencrypted backup:**
```powershell
Copy-Item -LiteralPath $backupPath -Destination $env:FACTUM_IL_DB_PATH -Force
```

**Encrypted backup (AES-256-GCM):**
```powershell
Restore-EncryptedBackup -BackupPath $backupPath `
  -KeyHex $env:BACKUP_ENCRYPT_KEY `
  -OutputPath $env:FACTUM_IL_DB_PATH
```

### 4. Repair FTS5 and validate

After restore:
```
POST /api/admin/repair/fts       ← rebuild FTS5 indexes
POST /api/admin/repair/integrity ← verify integrity
```

### 5. Deactivate safe mode

Set `FACTUM_IL_SAFE_MODE=0` and restart.

---

## Restoring from a Manifest Snapshot

```powershell
# Find snapshots for a document
$snapshots = sqlite3 -separator "`t" $dbPath "
  SELECT snapshot_id, trigger_event, created_at
    FROM ManifestSnapshots
   WHERE document_id = 42
   ORDER BY created_at DESC;"

# Restore from the most recent pre-mutation snapshot
Restore-FromManifest -DatabasePath $dbPath -SnapshotId 'uuid-here' -AgentSource 'ManualRecovery'
```

---

## Database WAL Recovery

```powershell
# Check integrity
sqlite3 $dbPath "PRAGMA integrity_check;"

# Force WAL checkpoint
sqlite3 $dbPath "PRAGMA wal_checkpoint(FULL);"
```

If corruption is confirmed:
1. Stop all writes (safe mode)
2. Copy the database to a safe location
3. Restore from the most recent backup
4. Replay `ActionLog` to reapply changes since the backup

---

## Processing State Reference

| State | Meaning | Recovery action |
|-------|---------|-----------------|
| `DISCOVERED` | Found on disk, not yet hashed | Re-run pipeline |
| `HASHED` | Hash computed, OCR not started | Re-run pipeline from OCR |
| `OCR_PENDING` | OCR queued but not complete | Reset to HASHED, re-queue |
| `OCR_COMPLETE` | OCR done, not yet classified | Re-run classification |
| `CLASSIFIED` | Type assigned, not enriched | Re-run enrichment |
| `ENRICHED` | AI enriched, awaiting review | No action needed |
| `REVIEW_PENDING` | Awaiting human approval | Review in dashboard |
| `APPLIED` | Approved, metadata written | No action needed |
| `VERIFIED` | Fully processed and verified | Terminal state |
| `FAILED` | Processing error | Investigate error, reset to DISCOVERED |
| `ROLLED_BACK` | File and metadata restored | Re-ingest if appropriate |

---

## Log Locations

| Log file | Content |
|----------|---------|
| `logs/system_YYYYMMDD.jsonl` | General system events (PII-sanitised) |
| `logs/ocr_YYYYMMDD.jsonl` | OCR processing events |
| `logs/ai_YYYYMMDD.jsonl` | AI enrichment events |
| `logs/guardrails_YYYYMMDD.jsonl` | Guardrails decisions |
| `logs/migration_YYYYMMDD.jsonl` | Database migration events |
| `logs/rollback_YYYYMMDD.jsonl` | Rollback operations |
| `logs/installer_YYYYMMDD.log` | Installer output |
| `logs/backup_YYYYMMDD.jsonl` | Backup scheduler events |

All JSONL logs contain: `timestamp`, `level`, `category`, `message`, `operationId`, `agentSource`, `fileHash`, `resultState`. PII fields are stripped by `packages/shared/src/logging/sanitizer.ts`.
