import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@factum-il/shared', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { runPostUpdateHealthCheck } from '../PostUpdateHealthCheck.js';
import type { UpdateStateStore } from '../UpdateStateStore.js';
import type { RollbackMetadata } from '../types.js';

// ── Mock restoreFromRollback ────────────────────────────────────────────────
//
// rollbackMock is used for normal (resolved/rejected) scenarios.
// rollbackForcedError, when non-null, causes the wrapper to throw synchronously
// without going through vi.fn() — this bypasses Vitest 3.x's mock-rejection
// tracking, which flags any Error associated with a vi.fn() rejection even when
// it is caught by the caller's try/catch.
const rollbackMock = vi.fn();
let rollbackForcedError: unknown = null;

vi.mock('../UpdateRollback.js', () => ({
  restoreFromRollback: (...args: unknown[]) => {
    if (rollbackForcedError !== null) throw rollbackForcedError;
    return rollbackMock(...args);
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeStateStore(state: {
  updateInProgress?: boolean;
  rollback?: RollbackMetadata | null;
}): UpdateStateStore {
  return {
    read:  vi.fn().mockResolvedValue({ updateInProgress: false, rollback: null, ...state }),
    write: vi.fn().mockResolvedValue(undefined),
  } as unknown as UpdateStateStore;
}

function makeDb(integrityResult = 'ok', missingTables: string[] = []) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      get: (...args: unknown[]) => {
        if (sql.includes('integrity_check')) return { integrity_check: integrityResult };
        const table = args[0] as string;
        if (missingTables.includes(table)) return undefined;
        return { 1: 1 };  // table exists
      },
    })),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runPostUpdateHealthCheck', () => {
  beforeEach(() => {
    rollbackMock.mockReset();
    rollbackForcedError = null;
  });

  it('skips the check when updateInProgress is false', async () => {
    const store = makeStateStore({ updateInProgress: false });
    const db    = makeDb();
    const result = await runPostUpdateHealthCheck(store, db, '/data/factum.db');
    expect(result.wasApplied).toBe(false);
    expect(result.healthy).toBe(true);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(rollbackMock).not.toHaveBeenCalled();
  });

  it('clears updateInProgress and returns healthy when all checks pass', async () => {
    const store = makeStateStore({ updateInProgress: true });
    const db    = makeDb('ok');
    const result = await runPostUpdateHealthCheck(store, db, '/data/factum.db');
    expect(result.wasApplied).toBe(true);
    expect(result.healthy).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.rollbackTriggered).toBe(false);
    expect(store.write).toHaveBeenCalledWith({ updateInProgress: false });
    expect(rollbackMock).not.toHaveBeenCalled();
  });

  it('triggers rollback when integrity_check fails', async () => {
    const rollback: RollbackMetadata = {
      rollbackAvailable: true, dbBackupPath: '/bak.db', installerPath: '/old.exe',
      previousVersion: '0.9.0', installedAt: '2026-01-01T00:00:00Z',
    };
    const store = makeStateStore({ updateInProgress: true, rollback });
    const db    = makeDb('*** corruption detected ***');
    rollbackMock.mockResolvedValue({ restored: true, installerLaunched: true });

    const result = await runPostUpdateHealthCheck(store, db, '/data/factum.db');

    expect(result.wasApplied).toBe(true);
    expect(result.healthy).toBe(false);
    expect(result.failures.some((f) => f.includes('integrity_check'))).toBe(true);
    expect(result.rollbackTriggered).toBe(true);
    expect(rollbackMock).toHaveBeenCalledWith(rollback, '/data/factum.db');
    expect(result.rollbackResult?.restored).toBe(true);
  });

  it('triggers rollback when a required table is missing', async () => {
    const store = makeStateStore({ updateInProgress: true, rollback: null });
    const db    = makeDb('ok', ['Documents']);
    rollbackMock.mockResolvedValue({ restored: false, reason: 'no backup', installerLaunched: false });

    const result = await runPostUpdateHealthCheck(store, db, '/data/factum.db');

    expect(result.healthy).toBe(false);
    expect(result.failures.some((f) => f.includes('Documents'))).toBe(true);
    expect(result.rollbackTriggered).toBe(true);
    expect(rollbackMock).toHaveBeenCalledWith(null, '/data/factum.db');
  });

  it('survives when restoreFromRollback itself throws', async () => {
    const store = makeStateStore({ updateInProgress: true });
    const db    = makeDb('corrupt');
    rollbackForcedError = new Error('disk full');

    const result = await runPostUpdateHealthCheck(store, db, '/data/factum.db');

    expect(result.rollbackTriggered).toBe(true);
    expect(result.rollbackResult?.restored).toBe(false);
    expect(result.rollbackResult?.installerLaunched).toBe(false);
  });
});
