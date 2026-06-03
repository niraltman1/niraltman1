# Worker Supervisor — Factum-IL v1.0.0

## Overview

The `WorkerSupervisor` (in `packages/api/src/supervisor/`) manages the lifecycle, health, and resource usage of all background workers. Each worker is a long-running async process tracked in both an in-memory registry and the `WorkerHealth` SQLite table.

**Safe Mode:** When `FACTUM_IL_SAFE_MODE=1`, all 6 workers are disabled at startup. The API server remains accessible; only background processing stops.

---

## Worker Types (6 total)

| Type | Responsibility | Safe Mode |
|------|---------------|-----------|
| `rag` | Embeds and enriches documents on `RAG_INTERVAL_MS` schedule (default 60s) | Disabled |
| `watcher` | File system event monitoring for watched directories | Disabled |
| `backup` | AES-256-GCM encrypted backup every hour | Disabled |
| `update` | Checks `FACTUM_IL_VERSION` against release manifest for updates | Disabled |
| `fts-heal` | Detects and auto-repairs broken FTS5 index | Disabled |
| `queue` | Dequeues and processes `QueueItems` | Disabled |

All 6 workers register themselves in `WorkerHealth` on startup and send heartbeats every `heartbeatIntervalMs`.

---

## TypeScript API

```typescript
const sup = new WorkerSupervisor(db, {
  memoryLimitMB:       512,     // recycle idle workers above this threshold
  heartbeatIntervalMs: 10_000,  // heartbeat + memory check interval
  staleWorkerMs:       60_000,  // reap workers with no heartbeat for this long
  safeMode:            process.env['FACTUM_IL_SAFE_MODE'] === '1',
});

// Spawn a worker (no-op in safe mode)
const workerId = sup.spawn('rag', 1);

// Run a task on a specific worker
const result = await sup.run(workerId, 'embed-batch', async () => {
  return ragWorker.processBatch(batchSize);
});

// Query health
const snapshots = sup.health();
// [{ workerId, type, status, memoryMB, tasksCompleted, tasksFailed, ... }]

// Graceful shutdown — waits for in-flight tasks, then marks all workers dead
await sup.gracefulShutdown(30_000);
```

---

## RAG Worker

Runs on a schedule controlled by `RAG_INTERVAL_MS` (default 60 000 ms):

1. Queries `Documents` for rows where `ai_enriched = 0` (batch size: `RAG_BATCH_SIZE`, default 10)
2. Health-checks Ollama: `GET http://127.0.0.1:11434/api/tags`
3. If Ollama is down: skips the cycle, logs a warning, waits for next interval
4. For each document: splits OCR text into chunks, embeds via Ollama, stores in `vec_chunks`
5. Runs the 5-step reasoning chain via the AI package
6. Validates response through `ai-guardrails`
7. Writes accepted enrichment to `AIEnrichmentLog`; rejected responses to `GuardrailsLog`
8. Sets `Documents.ai_enriched = 1`

---

## File Watcher

Monitors directories configured in `WatchFolders`:

- Default watch dirs: `%USERPROFILE%\Downloads`, `%USERPROFILE%\Documents`
- Additional directories can be added via `POST /api/admin/watcher/watch`
- Debounce: **800ms** — files are not processed until write events stop for 800ms
- Stability check: file size read twice (300ms gap) — must be identical
- Every detected file is checked against `EXCLUDED_PATTERNS` (Data Firewall) before enqueue

Events are logged to `WatcherEvents`. Duplicate files (same `file_hash`) are detected and skipped.

---

## Backup Scheduler

Runs every 60 minutes:

1. Triggers `PRAGMA wal_checkpoint(FULL)` on both database files
2. Copies `factum-il.db` and `_data.db` to backup directory
3. If `BACKUP_ENCRYPT=1`: encrypts with AES-256-GCM, stores IV and auth tag
4. Records result in `BackupSnapshots`
5. Prunes backup directory if total size exceeds limit (configurable)

Manual backup: `POST /api/admin/backups`

---

## Update Scheduler

Runs once on startup and then every 24 hours:

1. Reads `FACTUM_IL_VERSION` from environment (set by installer to `1.0.0`)
2. Fetches the release manifest (network check — no user data transmitted)
3. Compares versions
4. Writes result to `UpdateManifest` (migration 051)
5. Dashboard shows update badge if newer version is available

**No auto-update:** The system notifies of available updates but never downloads or installs them automatically. Updates require a new installer run.

---

## FTS Healing Service

Runs every 5 minutes:

1. Runs a test FTS5 query on each virtual table
2. If the query fails or returns inconsistent results: marks FTS as unhealthy
3. Auto-triggers `POST /api/admin/repair/fts` (equivalent) to rebuild

Healing events are logged to `SupervisorEvents`.

---

## Events

| Event | Payload |
|-------|---------|
| `worker:spawned` | `{ workerId, type }` |
| `worker:task-complete` | `{ workerId, taskName, durationMs }` |
| `worker:task-failed` | `{ workerId, taskName, error }` |
| `worker:recycled` | `{ workerId, reason: 'memory' }` |
| `worker:reaped` | `{ workerId }` (stale heartbeat) |
| `memory:pressure` | `{ memMB, limitMB }` |
| `supervisor:shutdown` | (no payload) |
| `supervisor:safe-mode` | `{ active: true }` |

---

## Memory Pressure

Every `heartbeatIntervalMs`, the supervisor:

1. Updates all heartbeat records in `WorkerHealth`
2. Samples `process.memoryUsage().rss`
3. If RSS > `memoryLimitMB` (default 512 MB): terminates idle workers until usage drops

---

## Crash Recovery

On startup (before spawning workers), the supervisor:

1. Reads `WorkerHealth` for any workers with `status = 'busy'` and stale `last_heartbeat`
2. Marks them `dead`
3. Releases any `Locks` held by dead workers
4. Re-queues any `QueueItems` locked by dead workers

This ensures that items processing at the time of a crash are recovered automatically.

---

## WorkerHealth Table

```sql
WorkerHealth (
  worker_id      TEXT PRIMARY KEY,    -- UUID
  type           TEXT NOT NULL,       -- rag | watcher | backup | update | fts-heal | queue
  status         TEXT NOT NULL,       -- idle | busy | stopping | dead
  memory_mb      REAL,
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed    INTEGER DEFAULT 0,
  current_task    TEXT,
  last_heartbeat  TEXT,
  started_at      TEXT,
  updated_at      TEXT DEFAULT (datetime('now'))
)
```

---

## Safe Mode — Implementation Detail

When `FACTUM_IL_SAFE_MODE=1`:

```typescript
if (process.env['FACTUM_IL_SAFE_MODE'] === '1') {
  logger.warn('[Supervisor] Safe mode active — all workers disabled');
  return;  // No workers are spawned
}
```

The supervisor still initialises the `WorkerHealth` table and the `sup.health()` endpoint returns an empty array. The admin dashboard shows "מצב בטוח פעיל" (Safe mode active) with a yellow banner.
