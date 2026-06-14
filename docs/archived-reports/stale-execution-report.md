# Stale Execution Validation Report

**Date:** 2026-05-25  
**Test file:** `packages/agent-core/src/stale-execution.test.ts`

---

## Test Results (8 tests — all PASS)

| Scenario | Result |
|----------|--------|
| valid:true when case state is unchanged (baseline) | ✅ PASS |
| isStale:true when case status changes open→closed | ✅ PASS |
| NEVER throws — always returns an object | ✅ PASS |
| isStale:true when doc_count increases (document added) | ✅ PASS |
| isStale:true when doc_count decreases (document removed) | ✅ PASS |
| isStale:true when updated_at advances (metadata update) | ✅ PASS |
| valid:true (optimistic) when DB throws | ✅ PASS |
| valid:false when case no longer exists | ✅ PASS |

---

## Staleness Detection Mechanism

The `computeCaseStateHash(caseId, db)` function queries:
```sql
SELECT c.status, c.updated_at,
       (SELECT COUNT(*) FROM Documents WHERE case_id = c.id) AS doc_count
  FROM Cases c WHERE c.id = ?
```

It hashes `{status}|{updated_at}|{doc_count}` via SHA-256, returning the first 16 hex characters. This hash is captured at request time and re-computed after agent execution completes.

`checkExecutionValidity(ctx, db)` **never throws**. On hash mismatch it returns `{ valid: false, reason: '...' }`. On DB error it returns `{ valid: true }` (optimistic — let the agent result through).

---

## API Response Contract

When the case state changed during execution, the API response includes:
```json
{
  "result": { ... agent output ... },
  "isStale": true,
  "staleReason": "Case 1 was modified after this request was queued — results may be outdated"
}
```

The response is **never HTTP 500** — results are always returned. The React dashboard shows a "Results may be outdated — re-run?" banner when `isStale: true`.

When staleness is detected, `journalEvent(db, 'stale_detected', ...)` is written to `AgentExecutionEvents` for audit trail.

---

## Coverage

All 4 mutation types covered:
1. Case `status` field change
2. Document added (`doc_count` increase)
3. Document removed (`doc_count` decrease)
4. `updated_at` timestamp change (metadata-only)
