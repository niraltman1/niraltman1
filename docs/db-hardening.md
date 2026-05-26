# Database Hardening

## WAL Mode

All databases run in WAL (Write-Ahead Logging) mode:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;      -- safe with WAL; faster than FULL
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';
PRAGMA cache_size = -32000;       -- 32 MB page cache
```

WAL mode provides:
- Readers never block writers
- Writers never block readers  
- Crash recovery via the WAL file (no partial writes to main DB file)

## WAL Checkpointing

Checkpoints are recorded in `WALCheckpoints`:

```sql
WALCheckpoints (
  id           INTEGER PRIMARY KEY,
  mode         TEXT NOT NULL,           -- PASSIVE | FULL | RESTART | TRUNCATE
  pages_written INTEGER NOT NULL,
  checkpointed_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

```typescript
const hardening = new DatabaseHardening(db);
await hardening.checkpoint('FULL');    // blocks until all WAL pages are checkpointed
```

Scheduled checkpoints run every 15 minutes via the pipeline engine's health loop.

## Integrity Checks

```typescript
const report = await hardening.checkIntegrity();
// report: { ok: boolean; errors: string[]; pageCount: number; sizeBytes: number; checkedAt: Date }
```

Runs:
1. `PRAGMA integrity_check` — detects B-tree corruption, page misuse
2. `PRAGMA foreign_key_check` — detects orphaned FK references

If `report.ok === false`, the dashboard shows a red banner and logs the errors.

## Hot Backup

```typescript
const result = await hardening.backup('/backups/factum-il-2024-01-15.db');
// result: { success: boolean; sizeBytes: number; backedUpAt: Date }
```

Process:
1. `PRAGMA wal_checkpoint(FULL)` — ensures WAL is fully flushed
2. `fs.copyFileSync(dbPath, backupPath)` — atomic OS-level copy
3. `fs.statSync(backupPath)` — verifies size > 0

Backup files are plain SQLite databases — no special restore procedure needed.

## Metrics Collection

The `DatabaseHardening.recordMetric()` method stores performance metrics:

```sql
Metrics (
  id          INTEGER PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value       REAL NOT NULL,
  tags        TEXT,                -- JSON
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Query aggregates over a time window:

```typescript
const stats = await hardening.getMetrics('pipeline_stage_ms', 24);
// { avg, min, max, count } for the last 24 hours
```

## Corruption Recovery

If `integrity_check` returns errors:

1. Stop all writes immediately
2. Copy the database file to a safe location
3. Restore from the most recent backup
4. Replay the `ActionLog` to reapply changes since the backup

The `CrashRecovery` module automates this process:

```powershell
Invoke-FullRecovery -DatabasePath $dbPath -BackupDir $backupDir
```

## SQLite Version Requirements

Minimum: SQLite 3.35.0 (2021-03-12) for `RETURNING` clause support.
Recommended: 3.43.0+ for improved FTS5 performance.

Check version: `sqlite3 --version` or `PRAGMA user_version`.
