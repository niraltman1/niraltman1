# Concurrency Validation Report

**Date:** 2026-05-25  
**Test file:** `packages/agent-core/src/concurrency-stress.test.ts`

---

## Test Results (7 tests — all PASS)

| Scenario | Result |
|----------|--------|
| 20 simultaneous canRunAgent calls → exactly 1 allowed | ✅ PASS |
| All blocked calls return unique traceId strings | ✅ PASS |
| Lock released after markAgentCompleted → next call succeeds | ✅ PASS |
| Lock released after markAgentFailed → next call succeeds | ✅ PASS |
| Concurrent locks on different cases all succeed independently | ✅ PASS |
| Same agent type on different cases does not interfere | ✅ PASS |
| 20 sequential lock attempts complete in < 200ms | ✅ PASS |

---

## Concurrency Mechanism

The `AgentRunRegistry` table has a `UNIQUE(agent_type, case_id, status)` constraint. `canRunAgent()` uses `INSERT OR IGNORE` — SQLite's atomic operation means only one INSERT can succeed when multiple writers compete. The `changes` count tells the winner.

Because `better-sqlite3` is synchronous, all concurrent Node.js calls serialize at the V8 event loop level. The UNIQUE constraint provides the correctness guarantee; SQLite's WAL mode ensures no reader blocks the writer.

---

## HTTP-level behavior

When `withCaseExecutionGuard` middleware fires and `canRunAgent()` returns `allowed: false`:

1. `journalEvent(db, 'concurrency_blocked', ...)` is written
2. A `ConflictError` is passed to Express error handler
3. Client receives `HTTP 409 { code: 'CONFLICT', error: 'Agent "X" is already running...' }`

The blocked caller's `traceId` from `canRunAgent` is logged but NOT registered in AgentRunRegistry (since `INSERT OR IGNORE` found an existing row and made no changes).

---

## Performance

20 sequential lock operations: < 200ms total (typically < 10ms on local hardware).

SQLite WAL mode keeps readers non-blocking during writes. No deadlocks possible — single writer, synchronous API.
