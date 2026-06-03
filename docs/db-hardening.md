# Database Hardening — Factum-IL v1.0.0

## WAL Mode and Connection Pragmas

All database connections open with:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';
PRAGMA cache_size = -32000;    -- 32 MB page cache
```

**Note:** `PRAGMA journal_mode = WAL` is executed *before* any transaction, not inside one — SQLite prohibits changing journal mode within a transaction. The migration runner separates PRAGMA statements from migration transaction bodies.

WAL mode provides:
- Readers never block writers
- Writers never block readers
- Crash recovery via the WAL file (no partial writes to main DB file)
- `busy_timeout = 5000` gives up to 5 seconds of retry before SQLITE_BUSY

---

## Two-Database Architecture

| File | Attached as | Content |
|------|-------------|---------|
| `factum-il.db` | _(main schema)_ | All entity tables, FTS5, queue, audit, rules |
| `_data.db` | `data_store` | `vec_chunks` and embedding rows |

`ATTACH DATABASE '..._data.db' AS data_store;` is issued on every connection open (after pragma setup, before migrations).

The separation keeps the primary database lean. VACUUM operations on `factum-il.db` are fast even with thousands of documents, because bulk embedding data lives in `_data.db`.

---

## Forward-Only Migrations with SHA-256 Checksums

### Migration Runner Rules

1. **Forward-only:** Migrations are never edited after being applied. No rollback migrations exist.
2. **One transaction per migration:** Each migration file runs inside a single SQLite transaction.
3. **PRAGMA separation:** PRAGMA statements in migration files are extracted and run before the transaction body.
4. **Nested BEGIN TRANSACTION filtering:** Migration files that contain their own `BEGIN TRANSACTION`/`COMMIT` blocks have those statements stripped by the runner before execution — the runner's own transaction is authoritative.
5. **Idempotency tracking:** The `_migrations` table records each applied migration with a SHA-256 checksum of the file content.

### `_migrations` Table

```sql
_migrations (
  id          INTEGER PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  checksum    TEXT NOT NULL,      -- SHA-256 of migration file at time of apply
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

If a migration file is changed after being applied, the runner detects the checksum mismatch and aborts with an error rather than silently applying a corrupted migration.

### Migration Count

**60 migrations** (001–060) are applied on first server start. Each runs exactly once. Migrations 001–060 are complete in v1.0.0.

---

## WAL Checkpointing

Checkpoints are recorded in `WALCheckpoints`:

```sql
WALCheckpoints (
  id              INTEGER PRIMARY KEY,
  mode            TEXT NOT NULL,           -- PASSIVE | FULL | RESTART | TRUNCATE
  pages_written   INTEGER NOT NULL,
  checkpointed_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

```typescript
const hardening = new DatabaseHardening(db);
await hardening.checkpoint('FULL');    // blocks until all WAL pages are checkpointed
```

Scheduled checkpoints run every 15 minutes via the pipeline engine's health loop. Checkpoints also run automatically before every encrypted backup.

---

## Integrity Checks

```typescript
const report = await hardening.checkIntegrity();
// report: { ok: boolean; errors: string[]; pageCount: number; sizeBytes: number; checkedAt: Date }
```

Runs:
1. `PRAGMA integrity_check` on `factum-il.db` — detects B-tree corruption, page misuse
2. `PRAGMA foreign_key_check` on `factum-il.db` — detects orphaned FK references
3. `PRAGMA integrity_check` on `data_store` — checks the attached `_data.db`

If `report.ok === false`, the dashboard shows a red banner and the errors are logged.

**API endpoint:** `POST /api/admin/repair/integrity`

---

## Hot Backup (AES-256-GCM Encrypted)

Backups run automatically every hour via `packages/encrypted-backup`. Manual backup:

`POST /api/admin/backups`

### Backup Process

1. `PRAGMA wal_checkpoint(FULL)` on both databases — ensures WAL is fully flushed
2. `fs.copyFileSync(dbPath, tempPath)` — atomic OS-level copy
3. If `BACKUP_ENCRYPT=1`: encrypt with AES-256-GCM using `BACKUP_ENCRYPT_KEY` (or scrypt-derived key)
4. Write encrypted file + IV + auth tag to backup directory
5. Record in `BackupSnapshots` with `is_encrypted`, `encryption_iv`, `encryption_tag`, `key_derivation`

Backup files are plain SQLite databases (if unencrypted) — no special restore procedure needed for unencrypted backups.

### Key Management

- `BACKUP_ENCRYPT_KEY`: 64-char hex string (256 bits)
- If absent and `BACKUP_ENCRYPT=1`: key is derived via scrypt from a machine-specific secret
- **Store the key externally.** Without it, encrypted backups cannot be decrypted.

---

## Corruption Recovery

If `integrity_check` returns errors:

1. Activate safe mode (`FACTUM_IL_SAFE_MODE=1`) and restart the server
2. Copy the database files to a safe location
3. Run `POST /api/admin/repair/integrity` to confirm the extent of corruption
4. Restore from the most recent backup
5. Replay `ActionLog` to reapply changes since the backup
6. Rebuild FTS5 indexes: `POST /api/admin/repair/fts`
7. Deactivate safe mode

PowerShell automation:

```powershell
Invoke-FullRecovery -DatabasePath $dbPath -BackupDir $backupDir
```

---

## Metrics Collection

```sql
Metrics (
  id          INTEGER PRIMARY KEY,
  metric_name TEXT NOT NULL,
  value       REAL NOT NULL,
  tags        TEXT,           -- JSON
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Query aggregates:

```typescript
const stats = await hardening.getMetrics('pipeline_stage_ms', 24);
// { avg, min, max, count } for the last 24 hours
```

---

## SQLite Version Requirements

| Requirement | Minimum version |
|------------|----------------|
| `RETURNING` clause | SQLite 3.35.0 (2021-03-12) |
| FTS5 improvements | SQLite 3.43.0+ (recommended) |
| sqlite-vec extension | Compatible with bundled SQLite |

Check version: `PRAGMA user_version;` or `sqlite3 --version`.

**bundled SQLite:** better-sqlite3 bundles its own SQLite — the system version on the machine is irrelevant. The bundled version is what matters for feature compatibility.

---

## Foreign Keys Policy

`PRAGMA foreign_keys = ON` is set on every connection. SQLite does not enforce FK constraints by default. Enabling per-connection ensures referential integrity (e.g., `ActionPlan.document_id` cannot reference a deleted `Document`).

Foreign key violations are caught by `PRAGMA foreign_key_check` in the integrity check endpoint. Violations are reported as errors and must be resolved before the system is considered healthy.
