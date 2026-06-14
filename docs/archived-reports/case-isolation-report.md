# Case Isolation Validation Report

**Date:** 2026-05-25  
**Test file:** `packages/retrieval/src/case-isolation-retrieval.test.ts`  
**Test file:** `packages/memory/src/case-scoped-memory.test.ts`  
**Test file:** `packages/agent-core/src/case-isolation-integration.test.ts` (retrieval isolation via mocked DB)

---

## Test Scenarios

### Retrieval Isolation (5 tests — all PASS)

| Scenario | Result |
|----------|--------|
| Case 1 retriever returns only case 1 document IDs | ✅ PASS |
| Case 2 retriever returns only case 2 document IDs | ✅ PASS |
| Scoped retriever never emits cross-case console.warn | ✅ PASS |
| Direct hybridSearch without caseId emits audit warning | ✅ PASS |
| Limit option respected | ✅ PASS |

### Memory Isolation (7 tests — all PASS)

| Scenario | Result |
|----------|--------|
| Case 1 memory load returns only case 1 entries | ✅ PASS |
| Case 2 memory load does not return case 1 entries | ✅ PASS |
| append() does not throw | ✅ PASS |
| prune() does not throw | ✅ PASS |
| Session store: set/get round-trips value | ✅ PASS |
| Session store: key set by case 1 invisible to case 2 | ✅ PASS |
| Session store: clearCase removes only target case keys | ✅ PASS |

---

## Isolation Guarantee

The `createCaseScopedRetriever(caseId, db)` factory binds `caseId` at construction time. The resulting retriever's `search()` method structurally cannot omit `caseId` when calling `hybridSearch()`. Cross-case leaks are **structurally impossible** via this API.

The `CaseScopedSessionStore` prefixes every key with `${caseId}:`. Keys from case A are invisible to case B because they hash to different storage keys. The `clearCase()` method removes only the current case's prefix.

The `createCaseScopedMemory(caseId, db)` factory passes `caseId` as an immutable argument to all DB queries (`WHERE case_id = ?`).

---

## Audit Trail

Any call to `hybridSearch()` without a `caseId` now emits:
```
[retrieval] hybridSearch called without caseId — results span ALL cases.
Use createCaseScopedRetriever() for case-specific agent calls.
```

This makes cross-case retrieval visible in production logs.
