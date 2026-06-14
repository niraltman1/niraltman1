# Patch Chaos Test Plan

Status: Required before Phase 4 ships  
Tests: `packages/update-core/src/patch-chaos.test.ts`

---

## Overview

These four chaos scenarios must all pass before Phase 4 is considered complete.
They are implemented as Vitest tests using mocked filesystem and database
(`packages/update-core/src/patch-chaos.test.ts`). Each test verifies that the
9-step `PatchManager` workflow handles catastrophic failure gracefully, leaving
the installation in a known-good or recoverable state.

---

## Scenario 1 — Disk Full During Patch Apply

**Setup:** Fill the test filesystem to >99% capacity before Step 6 (Apply Files).

**Trigger:** `PatchManager.applyFiles()` throws `ENOSPC` (no space left on device).

**Expected behavior:**
1. `PatchManager` catches the error from Step 6.
2. Auto-rollback triggers via `restoreFromRollback()`.
3. DB is restored from the recovery point snapshot.
4. Audit event `patch_validation_failed` is emitted with `{ reason: 'ENOSPC' }`.
5. `UpdateStateStore.systemState` returns to `'NORMAL'` (not stuck in `'UPDATING'`).
6. `PatchManager.apply()` returns `{ success: false, error: 'Disk full during file apply' }`.

**Implementation:**
```typescript
it('rolls back cleanly when disk is full during apply', async () => {
  vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }));
  // ... apply patch, assert rollback restored, assert NORMAL state
});
```

---

## Scenario 2 — Migration Cascade Failure

**Setup:** Patch includes migrations 081 and 082. Migration 081 succeeds;
migration 082 throws a SQLite constraint error.

**Trigger:** Step 7 migration execution fails mid-sequence.

**Expected behavior:**
1. `PatchManager` detects the failure in Step 7.
2. Auto-rollback triggers: `restoreFromRollback()` restores the DB snapshot.
3. Migration 081's changes are NOT present in the restored DB.
4. Audit event `patch_rolled_back` is emitted with `{ failedMigration: 82 }`.
5. Return `{ success: false, error: 'Migration 082 failed: UNIQUE constraint violated' }`.

**Implementation:**
```typescript
it('rolls back all migrations if one fails mid-sequence', async () => {
  vi.spyOn(mockDb, 'prepare').mockImplementationOnce(/* 081 ok */).mockImplementationOnce(/* 082 throws */);
  // ... apply, assert rollback, assert 081 changes absent
});
```

---

## Scenario 3 — Health Check Timeout

**Setup:** Mock `PostUpdateHealthCheck.run()` to never resolve (hangs indefinitely).

**Trigger:** Step 8 (Health Check) exceeds `HEALTH_CHECK_TIMEOUT_MS` (default 30 000 ms).

**Expected behavior:**
1. `PatchManager` cancels the health check after the timeout.
2. Auto-rollback triggers.
3. Audit event `patch_rolled_back` is emitted with `{ reason: 'HEALTH_CHECK_TIMEOUT' }`.
4. `UpdateStateStore.systemState` is NOT left as `'UPDATING'`.
5. Return `{ success: false, error: 'Health check timed out' }`.

**Implementation:**
```typescript
it('rolls back when health check hangs past timeout', async () => {
  vi.spyOn(healthCheck, 'run').mockReturnValue(new Promise(() => { /* never resolves */ }));
  vi.useFakeTimers();
  const applyPromise = patchManager.apply(patchPath);
  vi.advanceTimersByTime(HEALTH_CHECK_TIMEOUT_MS + 1000);
  await expect(applyPromise).resolves.toMatchObject({ success: false });
  // assert rollback was invoked, state is NORMAL
});
```

---

## Scenario 4 — Rollback Failure (Safe Mode Fallback)

**Setup:** The recovery point file is deleted between creation and rollback trigger.
Simulate by having `restoreRecoveryPoint()` throw `ENOENT`.

**Trigger:** Auto-rollback in Step 5–9 fails because recovery point is missing.

**Expected behavior:**
1. `PatchRollbackManager.rollbackPatch()` catches the `ENOENT` error.
2. **Safe Mode fallback:** `UpdateStateStore.write({ systemState: 'SAFE_MODE' })`.
3. Audit event `patch_rolled_back` is emitted with `{ status: 'SAFE_MODE_FALLBACK' }`.
4. `PatchManager.apply()` returns `{ success: false, error: 'Rollback failed — entering safe mode' }`.
5. Subsequent call to `stateStore.read()` returns `{ systemState: 'SAFE_MODE' }`.

**Implementation:**
```typescript
it('enters SAFE_MODE when rollback itself fails', async () => {
  vi.spyOn(rollbackMgr, 'restoreRecoveryPoint').mockRejectedValueOnce(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
  );
  // ... trigger a patch failure, assert SAFE_MODE written
  const state = await stateStore.read();
  expect(state.systemState).toBe('SAFE_MODE');
});
```

---

## Pass Criteria

All four tests must pass in CI before Phase 4 can be merged:

```bash
pnpm --filter @factum-il/update-core test -- --testPathPattern=patch-chaos
```

Expected output: `4 passed, 0 failed`.
