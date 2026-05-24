# Factum IL Recovery & Rollback Guide

## Core Safety Guarantees

1. **Original files are never deleted** — only copies are moved to storage
2. **Every mutation is logged** in `ActionLog` with before/after hashes
3. **Every mutation is preceded** by a `ManifestSnapshot`
4. **All state transitions are atomic** — no partial states
5. **SHA-256 integrity is verified** before and after every file operation

---

## Crash Recovery

If the pipeline is interrupted (power loss, process kill, system crash):

### Step 1 — Identify incomplete operations

```powershell
Import-Module .\factum-il\powershell\FactumIL.psm1
sqlite3 $dbPath "SELECT * FROM ProcessingStatus WHERE success = 0 ORDER BY transitioned_at DESC LIMIT 20;"
```

### Step 2 — Find documents in FAILED or partial states

```sql
SELECT id, filename, processing_state, updated_at
  FROM Documents
 WHERE processing_state IN ('OCR_PENDING', 'CLASSIFIED', 'FAILED')
 ORDER BY updated_at DESC;
```

### Step 3 — Reset to DISCOVERED for reprocessing

```sql
UPDATE Documents
   SET processing_state = 'DISCOVERED',
       updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE processing_state = 'FAILED';
```

Or use the state machine:

```powershell
Invoke-StateTransition -DatabasePath $dbPath -DocumentId 42 -ToState 'DISCOVERED' -AgentSource 'Recovery'
```

---

## Rolling Back a Single File Operation

### Find the ActionLog entry

```sql
SELECT id, operation_type, path_before, path_after, file_hash_before, logged_at
  FROM ActionLog
 WHERE document_id = 42
   AND is_reversible = 1
   AND rolled_back = 0
 ORDER BY logged_at DESC;
```

### Execute the rollback

```powershell
Invoke-RollbackAction -DatabasePath $dbPath -ActionLogId 123 -AgentSource 'ManualRecovery'
```

This will:
1. Move the file back to `path_before`
2. Verify the restored file hash matches `file_hash_before`
3. Mark the original `ActionLog` entry as `rolled_back = 1`
4. Insert a compensating `ROLLBACK` entry in `ActionLog`

---

## Restoring from a Manifest Snapshot

When a document's metadata needs to be fully restored:

```powershell
# Find the snapshot taken before a mutation
$snapshots = sqlite3 -separator "`t" $dbPath "
  SELECT snapshot_id, trigger_event, created_at
    FROM ManifestSnapshots
   WHERE document_id = 42
   ORDER BY created_at DESC;"

# Restore from the most recent pre-mutation snapshot
Restore-FromManifest -DatabasePath $dbPath -SnapshotId 'uuid-here' -AgentSource 'ManualRecovery'
```

This resets `processing_state` to `DISCOVERED` for re-ingestion.

---

## Verifying File Integrity

```powershell
# Check all stored files against their recorded hashes
$docs = sqlite3 -separator "`t" $dbPath "SELECT id, storage_path, file_hash FROM Documents;"
foreach ($row in $docs) {
    $fields = $row -split "`t"
    $id     = $fields[0]
    $path   = $fields[1]
    $hash   = $fields[2]
    if (Test-Path -LiteralPath $path) {
        try {
            Assert-FileIntegrity -FilePath $path -ExpectedHash $hash
            Write-Host "[OK] doc=$id"
        } catch {
            Write-Warning "[FAIL] doc=$id: $_"
        }
    } else {
        Write-Warning "[MISSING] doc=$id path=$path"
    }
}
```

---

## Database WAL Recovery

SQLite WAL mode protects against corruption on crash. If the database is suspected corrupt:

```powershell
# Check integrity
sqlite3 $dbPath "PRAGMA integrity_check;"

# Force WAL checkpoint
sqlite3 $dbPath "PRAGMA wal_checkpoint(FULL);"

# If corruption is confirmed, restore from last known-good backup
```

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
| `logs/system_YYYYMMDD.jsonl` | General system events |
| `logs/ocr_YYYYMMDD.jsonl`    | OCR processing events |
| `logs/ai_YYYYMMDD.jsonl`     | AI enrichment events |
| `logs/migration_YYYYMMDD.jsonl` | Database migration events |
| `logs/rollback_YYYYMMDD.jsonl` | Rollback operations |
| `logs/installer_YYYYMMDD.log`  | Installer output |

All JSONL logs contain: `timestamp`, `level`, `category`, `message`, `operationId`, `agentSource`, `fileHash`, `resultState`.
