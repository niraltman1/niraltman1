# Chaos Testing Guide — Factum-IL v1.0.0

## Philosophy

The chaos test suite validates that Factum-IL is **recoverable, not merely resilient**. Every test simulates a real failure mode and asserts that the system can reach a consistent state — either automatically or via the documented recovery procedures.

Chaos tests are part of the CI pipeline. Every pull request runs the full chaos suite. A PR may not merge if any chaos test fails.

---

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
| Poison queue requeue | Manually call requeue endpoint | `is_poisoned` reset, item re-processable |

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
| FTS5 index corrupt | Manually corrupt FTS5 shadow tables | Repair endpoint rebuilds index; subsequent search succeeds |

### Agent Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| Ollama unavailable during agent run | Stop Ollama, trigger agent | Agent reports degraded mode; no crash |
| Two agents on same case simultaneously | Concurrent POST to agent endpoint | Second call returns 409 AGENT_BUSY |
| Agent lock not released (crash) | Insert stale `AgentExecutionLog` row | `POST /api/recovery/clear-locks` releases it |
| Case modified mid-agent | Update case while agent runs | Agent reports stale results before conclusion |
| Agent timeout | Exceed agent TTL | Lock released; agent marked failed in `AgentExecutionLog` |

### Safe Mode Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| Safe mode activation | Set `FACTUM_IL_SAFE_MODE=1`, restart | All 6 workers stop; API remains accessible |
| Repair endpoint in safe mode | Run all repair endpoints under safe mode | All endpoints succeed without worker interference |
| Safe mode deactivation | Set `FACTUM_IL_SAFE_MODE=0`, restart | All workers restart; queue processing resumes |

### Recovery Chaos

| Scenario | Simulation | Expected outcome |
|----------|-----------|-----------------|
| Pipeline stopped mid-OCR | Kill process during OCR stage | HASHED documents reset via `POST /api/admin/repair/manifest` |
| FTS5 out of sync | Manually delete FTS5 shadow rows | `POST /api/admin/repair/fts` rebuilds; search works after |
| RAG enrichment stale | Set `ai_enriched=1` on all docs, corrupt vectors | `POST /api/admin/repair/rag` resets; re-enrichment begins |
| Backup restore | Restore from backup, verify data | All entities intact; FTS5 rebuilt; system healthy |

---

## Running the Chaos Suite

```bash
# Full chaos suite
pnpm --filter @factum-il/tests vitest run tests/integration/chaos.test.ts

# Full integration suite (includes chaos)
pnpm --filter @factum-il/tests vitest run tests/integration/

# Search chaos only
pnpm --filter @factum-il/tests vitest run tests/integration/search-scale.test.ts

# Agent chaos only
pnpm --filter @factum-il/tests vitest run tests/integration/agent-chaos.test.ts

# Safe mode chaos only
pnpm --filter @factum-il/tests vitest run tests/integration/safe-mode.test.ts
```

---

## Observing Results

After a chaos run, check:

1. `WorkerHealth` table — no `busy` workers with stale `last_heartbeat`
2. `QueueItems` — no items locked to dead workers
3. `TransactionJournal` — all `INTERRUPTED` entries have `replayed = 1`
4. `Locks` — no entries with `expires_at < now()`
5. `PRAGMA integrity_check` returns `ok` on both database files
6. `AgentExecutionLog` — no `running` entries older than the TTL
7. `GuardrailsLog` — rejected responses are logged, not silently dropped

---

## Adding New Chaos Scenarios

1. Identify the failure mode (power loss, OOM, race condition, corrupt file, network partition)
2. Simulate it by directly manipulating SQLite state (timestamps, flags, lock records)
3. Run the recovery function or endpoint
4. Assert the system reached a consistent state using a verifiable SQL query
5. Add to `tests/integration/chaos.test.ts`

**Golden rule:** A chaos test must always end with a verifiable assertion about system state — not just "it didn't crash." The assertion must be a SQL query against the database or an API response, not a log check.

---

## CI Integration

The chaos suite runs as part of the `test` workflow on every PR:

```yaml
# .github/workflows/test.yml
- name: Run chaos tests
  run: pnpm --filter @factum-il/tests vitest run tests/integration/chaos.test.ts
  env:
    FACTUM_IL_DB_PATH: ":memory:"
    FACTUM_IL_SAFE_MODE: "0"
    OLLAMA_BASE_URL: "http://localhost:11434"  # mocked in CI
```

The chaos tests use in-memory SQLite (`:memory:`) for speed and isolation. Ollama calls are mocked in CI — only the health check and response format are tested, not actual AI output quality.
