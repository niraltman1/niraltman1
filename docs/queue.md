# Processing Queue — Factum-IL v1.0.0

## Design Goals

- **Crash-proof**: Every item survives process restarts
- **At-least-once delivery**: Items are never silently lost
- **Poison isolation**: Permanently failing items are quarantined without blocking healthy items
- **No external broker**: 100% SQLite, zero infrastructure dependencies
- **WAL-safe**: All queue operations are compatible with WAL mode concurrent reads

---

## Schema (migration 005)

```sql
QueueItems (
  item_id         TEXT PRIMARY KEY,   -- UUID
  file_hash       TEXT NOT NULL,      -- deduplication key
  original_path   TEXT NOT NULL,
  priority        INTEGER DEFAULT 5,  -- higher = processed first
  current_state   TEXT DEFAULT 'DISCOVERED',
  retry_count     INTEGER DEFAULT 0,
  max_retries     INTEGER DEFAULT 3,
  next_retry_at   TEXT,               -- earliest time item may be dequeued again
  worker_id       TEXT,               -- NULL = available
  lock_expires_at TEXT,               -- mandatory TTL (5 minutes)
  is_poisoned     INTEGER DEFAULT 0,  -- 1 = never dequeue
  error_message   TEXT,               -- last failure reason
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
)
```

---

## Worker Health Table (migration 006)

```sql
-- Tracks which worker holds which queue items
-- Stale entries (last_heartbeat > staleWorkerMs) are cleaned up on startup
WorkerHealth (
  worker_id      TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'idle',
  last_heartbeat TEXT,
  ...
)
```

`QueueItems.worker_id` references `WorkerHealth.worker_id`. When a worker is reaped (stale heartbeat), its queue items have their `lock_expires_at` set to `now() - 1` so they are immediately reclaimable.

---

## Enqueue

```typescript
queue.enqueue(fileHash, filePath, priority?, state?, maxRetries?)
```

- Checks for an existing non-terminal, non-poisoned item with the same `file_hash`
- If found, returns the existing `item_id` (idempotent — no duplicate processing)
- If not found, inserts with a new UUID

All files pass through the Data Firewall check before being enqueued. Blocked files are never inserted into `QueueItems`.

---

## Dequeue

```typescript
const item = queue.dequeue()
```

1. Releases any expired locks (`lock_expires_at < now()`)
2. Selects the highest-priority available item:
   `worker_id IS NULL AND next_retry_at <= now() AND is_poisoned = 0`
3. Updates `worker_id` and `lock_expires_at = now() + 5 minutes` inside a single SQLite transaction
4. Re-reads the row to verify ownership before returning — prevents double-claim under concurrent workers

---

## Retry and Backoff

On failure:

```typescript
queue.fail(itemId, errorMessage)
```

- Increments `retry_count`
- Records `error_message`
- Sets `next_retry_at = now() + min(5s × 2^retryCount, 600s)`
- If `retry_count >= max_retries` → sets `is_poisoned = 1`
- Records the error in `ProcessingStatus`

Backoff schedule (default `max_retries = 3`):

| Attempt | Delay |
|---------|-------|
| 1st | 5s |
| 2nd | 10s |
| 3rd | 20s |
| Poison | — (never retried automatically) |

---

## Poison Queue

Poisoned items appear in the dashboard under the "Poisoned" panel (`GET /api/queue/review-pending` filtered by `is_poisoned = 1`). Each item shows the last `error_message`.

Manual requeue via UI or API:

```
POST /api/queue/requeue/:itemId
```

This resets `is_poisoned = 0`, `retry_count = 0`, `worker_id = NULL`, `next_retry_at = now()`. The item re-enters the normal queue at its original priority.

---

## Crash Recovery

```typescript
queue.recover()          // TypeScript
Invoke-QueueRecovery     // PowerShell
```

Run once on startup (called automatically by the supervisor):

1. Releases locks where `lock_expires_at < now()`
2. Sets `worker_id = NULL` for items held by dead workers
3. Re-enqueues FAILED items that have remaining retries

---

## WAL-Mode Queue Safety

The queue is designed for SQLite WAL mode:

- All state changes (`worker_id`, `lock_expires_at`) happen in a single transaction
- `SELECT … FOR UPDATE` is simulated by the atomic `UPDATE … WHERE worker_id IS NULL` pattern
- No explicit locking primitives are used — SQLite's transaction serialisation is sufficient
- `busy_timeout = 5000` handles the brief contention window between concurrent queue workers

---

## API Endpoints

```
GET  /api/queue/review-pending      → QueueItem[] (pending + poisoned)
POST /api/queue/approve/:id         → { itemId: string; status: 'APPROVED' }
POST /api/queue/correct/:id         → { itemId: string; corrections: object }
POST /api/queue/requeue/:itemId     → { itemId: string; requeuedAt: string }
```

---

## PowerShell API

| Function | Description |
|----------|------------|
| `Add-QueueItem` | Enqueue with idempotency check |
| `Get-NextQueueItem` | Atomic dequeue with lock |
| `Complete-QueueItem` | Mark complete on success |
| `Fail-QueueItem` | Increment retries or poison |
| `Get-QueueDepth` | Count of non-poisoned items |
| `Get-PoisonedItems` | List all poisoned items |
| `Invoke-QueueRecovery` | Release stale locks + re-queue failed items |

---

## Queue Monitoring

The admin dashboard (`/admin`) shows:

- **Queue Depth**: non-poisoned items pending processing
- **Poisoned Count**: items that exceeded max retries
- **In-Progress**: items currently locked by a worker
- **Worker Count**: active workers processing queue items

Metrics are recorded in the `Metrics` table (migration 005, schema updated in migration 040) for trending over time.
