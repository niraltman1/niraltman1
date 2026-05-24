# Chaos Testing Guide

## Philosophy

The chaos test suite validates that Factum IL is **recoverable, not merely resilient**. Every test simulates a real failure mode and asserts that the system can reach a consistent state without human intervention.

## Test Matrix

### Queue Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| Worker crash mid-processing | Set `lock_expires_at` to past, restart queue | Item available for reprocessing after `recover()` |
| Duplicate enqueue | Enqueue same `file_hash` twice | Returns same `item_id` (idempotent) |
| Max retries exceeded | Fail item N+1 times | Item becomes poisoned, never returned by `dequeue()` |
| DB reopen after enqueue | Close + reopen SQLite file | All items still present, recoverable |
| 50 concurrent workers | 50 `LockService` instances attempt same resource | Exactly 1 wins |
| Stale lock cleanup | Lock TTL = `-1 hour` in DB | Next `acquire()` deletes it and succeeds |

### Transaction Journal Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| Power loss during MOVE | `begin()` → `markInterrupted()` without commit/rollback | `getInterrupted()` returns entry; replay restores file |
| Crash during COMMIT | Phase stays at `BEGIN` in DB | Treated as interrupted on restart |
| Valid COMMIT | Normal `begin()` → `commit()` | Not returned by `getInterrupted()` |
| Journal survives reopen | Write interrupted tx, close DB, reopen | `getInterrupted()` still finds it |

### Supervisor Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| 100 concurrent tasks | 5 workers × 20 tasks | All 100 complete, no task lost |
| Mixed pass/fail tasks | Alternating throw/succeed | `tasksCompleted` + `tasksFailed` accurate |
| Worker terminated while busy | `terminate()` during active task | Task drains; worker marked stopping, then dead |
| Graceful shutdown | `gracefulShutdown(timeout)` | Returns when all tasks drain or timeout elapses |

### Search Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| 10k documents cold query | Fresh engine, no cache | Result in < 200ms |
| Hebrew prefix query | Search `לחוזה` | Finds documents with `חוזה` |
| Synonym expansion | Search `חוזה` | Finds documents with `הסכם` |
| Cache hit | Second identical query | Returns in < 10ms |
| Filtered query | `documentType = CONTRACT` | Narrows result set, still fast |

## Running the Chaos Suite

```bash
# TypeScript integration chaos tests
pnpm --filter @factum-il/tests vitest run tests/integration/chaos.test.ts

# Full integration suite
pnpm --filter @factum-il/tests vitest run tests/integration/

# Search scaling
pnpm --filter @factum-il/tests vitest run tests/integration/search-scale.test.ts
```

## PowerShell Chaos Tests

```powershell
# Simulate crash by killing the process mid-queue
$job = Start-Job {
  Import-Module .\powershell\FactumIL.psd1
  Add-QueueItem -FileHash 'abc' -FilePath 'C:\test.pdf' -DatabasePath $db
  $item = Get-NextQueueItem -DatabasePath $db
  Start-Sleep -Seconds 1
  # Job killed here (simulated crash)
}
Start-Sleep -Milliseconds 500
Stop-Job $job

# Recover on restart
Invoke-QueueRecovery -DatabasePath $db
$recovered = Get-NextQueueItem -DatabasePath $db
# $recovered should not be null
```

## Observing Results

After a chaos run, check:

1. `WorkerHealth` table — no `busy` workers with stale `last_heartbeat`
2. `ProcessingQueue` — no items locked to dead workers
3. `TransactionJournal` — all `INTERRUPTED` entries have `replayed = 1`
4. `Locks` — no entries with `expires_at < now()`
5. `PRAGMA integrity_check` returns `ok`

## Adding New Chaos Scenarios

1. Identify the failure mode (power loss, OOM, race condition, corrupt file)
2. Simulate it by directly manipulating the SQLite state (timestamps, flags)
3. Run the recovery function
4. Assert the system reached a consistent state
5. Add to `tests/integration/chaos.test.ts`

The golden rule: **a chaos test must always end with a verifiable assertion about system state — not just "it didn't crash".**
