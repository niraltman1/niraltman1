# Processing Queue

## Design Goals

- **Crash-proof**: Every item survives process restarts
- **At-least-once delivery**: Items are never silently lost
- **Poison isolation**: Permanently failing items are quarantined without blocking healthy items
- **No external broker**: 100% SQLite, zero infrastructure dependencies

## Schema

```sql
ProcessingQueue (
  item_id         TEXT PRIMARY KEY,   -- UUID
  file_hash       TEXT NOT NULL,      -- deduplication key
  original_path   TEXT NOT NULL,
  priority        INTEGER DEFAULT 5,  -- higher = processed first
  current_state   TEXT DEFAULT 'DISCOVERED',
  retry_count     INTEGER DEFAULT 0,
  max_retries     INTEGER DEFAULT 3,
  next_retry_at   TEXT,               -- earliest time item may be dequeued again
  worker_id       TEXT,               -- NULL = available
  lock_expires_at TEXT,               -- mandatory TTL
  is_poisoned     INTEGER DEFAULT 0   -- 1 = never dequeue
)
```

## Enqueue

```typescript
queue.enqueue(fileHash, filePath, priority?, state?, maxRetries?)
```

- Checks for an existing non-terminal, non-poisoned item with the same `file_hash`
- If found, returns the existing `item_id` (idempotent)
- If not found, inserts with a new UUID

## Dequeue

```typescript
const item = queue.dequeue()
```

1. Releases any expired locks (`lock_expires_at < now()`)
2. Selects the highest-priority available item: `worker_id IS NULL AND next_retry_at <= now() AND is_poisoned = 0`
3. Updates `worker_id` and `lock_expires_at = now() + 5 minutes` inside a transaction
4. Re-reads the row to verify ownership before returning — prevents double-claim under concurrent workers

## Retry and Backoff

On failure:

```typescript
queue.fail(itemId, errorMessage)
```

- Increments `retry_count`
- Sets `next_retry_at = now() + min(5s × 2^retryCount, 600s)`
- If `retry_count >= max_retries` → sets `is_poisoned = 1`
- Records the error in `ProcessingStatus`

Backoff schedule (default `max_retries = 3`):

| Attempt | Delay  |
|---------|--------|
| 1st     | 5s     |
| 2nd     | 10s    |
| 3rd     | 20s    |
| Poison  | —      |

## Poison Queue

Poisoned items appear in the `/queue` dashboard under the "Poisoned" panel. Each item can be manually requeued via the UI (POST `/api/queue/requeue/:itemId`), which:

1. Resets `is_poisoned = 0`, `retry_count = 0`, `worker_id = NULL`
2. Sets `next_retry_at = now()`
3. Invalidates `QueueStats` and `PoisonedItems` React Query caches

## Crash Recovery

```typescript
queue.recover()          // TypeScript
Invoke-QueueRecovery     // PowerShell
```

Run once on startup:
1. Releases locks where `lock_expires_at < now()`
2. Re-enqueues FAILED items that have remaining retries

## PowerShell API

| Function             | Description                                      |
|----------------------|--------------------------------------------------|
| `Add-QueueItem`      | Enqueue with idempotency check                   |
| `Get-NextQueueItem`  | Atomic dequeue with lock                         |
| `Complete-QueueItem` | Delete on success                                |
| `Fail-QueueItem`     | Increment retries or poison                      |
| `Get-QueueDepth`     | Count of non-poisoned items                      |
| `Get-PoisonedItems`  | List all poisoned items                          |
| `Invoke-QueueRecovery` | Release stale locks + re-queue failed items   |
