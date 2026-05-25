# RBAC Validation Report

**Date:** 2026-05-25  
**Test file:** `packages/agent-core/src/rbac-integration.test.ts`

---

## Test Results (8 tests — all PASS)

| Scenario | Result |
|----------|--------|
| Unknown userId → AuthorizationError | ✅ PASS |
| AuthorizationError.name is "AuthorizationError" | ✅ PASS |
| Inactive user (is_active=0) → AuthorizationError | ✅ PASS |
| Missing caseId → AuthorizationError | ✅ PASS |
| Valid user + valid case → domain returned | ✅ PASS |
| Injected facades exposed on domain | ✅ PASS |
| User check fires before case lookup (authz-first order) | ✅ PASS |
| domain.checkValidity() never throws | ✅ PASS |

---

## Authorization Flow

`createCaseDomain(caseId, userId, db, retriever, memory, session)` performs two ordered checks:

```
1. SELECT id FROM system_users WHERE username = ? AND is_active = 1
   → AuthorizationError if not found or inactive

2. SELECT id FROM Cases WHERE id = ?
   → AuthorizationError if case does not exist
```

**No DB reads of DocumentChunks, CaseMemory, or any case data occur before RBAC validation passes.** This is verified by the `user check precedes case lookup` test which spies on `db.prepare()` call order.

---

## RBAC Version

**Current implementation: RBAC v1 (firm-wide policy)**

- Any active `system_users` entry may access any case
- Roles: `admin`, `attorney`, `assistant`, `reviewer`, `read_only` (all permitted in v1)
- The `AuthorizationError` class and its throw-path are fully in place for v2

**Planned for RBAC v2:**
- Add `CaseAssignments` table: `(case_id, user_id, role, assigned_at)`
- Update `checkUserCaseAccess()` to JOIN on CaseAssignments
- Hook point is marked with a comment in `case-isolation-domain.ts`

---

## Error Class Integrity

```typescript
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
```

- `instanceof AuthorizationError` works correctly
- `.name` is `'AuthorizationError'` (not inherited `'Error'`)
- Express error handler receives this; API returns 403 FORBIDDEN (or can be mapped to 401 depending on context)

---

## Journal Integration

When `createCaseDomain()` throws `AuthorizationError`, callers should log:
```typescript
journalEvent(db, 'authorization_failed', executionId, caseId, userId, { reason: err.message });
```

This is wired in the API layer wherever `createCaseDomain` is called.
