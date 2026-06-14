/**
 * Patch Chaos Tests — four must-pass scenarios from PATCH_CHAOS_TEST_PLAN.md.
 * All filesystem/DB operations are mocked. No real files or databases are used.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import * as fsMod from 'node:fs/promises';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EXTRACTED_DIR = '/tmp/test-patch';
const DB_PATH       = '/tmp/test.db';
const DATA_PATH     = '/tmp/factum-data';

const baseManifest = {
  formatVersion:            1,
  minimumSupportedVersion:  '1.0.0',
  version:                  '1.0.0',
  minCompatible:            '1.0.0',
  targetVersion:            '1.1.0',
  releaseDate:              '2026-06-14T00:00:00Z',
  releaseNotes:             'test patch',
  signingKeyId:             'factum-prod-2026',
  requiredMigrations:       [],
  migrations:               [81],
  sha256map:                { 'migrations/081.sql': 'abc123' },
};

function makeMockDb() {
  return {
    prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
    transaction: vi.fn().mockImplementation((fn: () => void) => { fn(); return fn; }),
  };
}

function makeMockStateStore() {
  let state = {
    currentVersion:   '1.0.0',
    channel:          'stable' as const,
    lastCheckedAt:    null,
    pendingManifest:  null,
    rollback:         null,
    updateInProgress: false,
    systemState:      'NORMAL' as const,
    recoveryPoints:   [] as unknown[],
  };
  return {
    read:  vi.fn().mockImplementation(async () => ({ ...state })),
    write: vi.fn().mockImplementation(async (partial: Partial<typeof state>) => {
      state = { ...state, ...partial };
    }),
    _getState: () => state,
  };
}

// ── Scenario 1: Disk full during patch apply ───────────────────────────────────

describe('Chaos Scenario 1 — disk full during Apply Files', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rolls back cleanly when disk is full during file apply (ENOSPC)', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();
    const db = makeMockDb();

    // Stub: readdir, readFile return valid migration, copyFile throws ENOSPC on file copy
    vi.spyOn(fsMod, 'readdir').mockResolvedValue(['081.sql'] as never);
    vi.spyOn(fsMod, 'readFile')
      .mockResolvedValueOnce(Buffer.from('hash-content')) // recovery point read
      .mockResolvedValue(Buffer.from('CREATE TABLE test (id INTEGER);') as never);
    vi.spyOn(fsMod, 'stat').mockResolvedValue({ size: 100 } as never);
    vi.spyOn(fsMod, 'mkdir').mockResolvedValue(undefined);

    let copyCallCount = 0;
    vi.spyOn(fsMod, 'copyFile').mockImplementation(async () => {
      copyCallCount++;
      if (copyCallCount === 2) {
        // First copyFile is recovery point creation; second is Apply Files
        const err = Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
        throw err;
      }
    });

    const mgr = new PatchManager(DATA_PATH, DB_PATH, stateStore as never);
    const result = await mgr.apply(
      EXTRACTED_DIR, baseManifest, '1.0.0', new Set<number>(), db as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No space left|ENOSPC/i);
    // State should not be stuck in UPDATING
    const finalState = stateStore._getState();
    expect(['NORMAL', 'SAFE_MODE']).toContain(finalState.systemState);
  });
});

// ── Scenario 2: Migration cascade failure ──────────────────────────────────────

describe('Chaos Scenario 2 — migration cascade failure', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('rolls back when migration 082 fails after 081 succeeded', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();

    const manifest082 = {
      ...baseManifest,
      migrations: [81, 82],
      sha256map: { 'migrations/081.sql': 'abc', 'migrations/082.sql': 'def' },
    };

    vi.spyOn(fsMod, 'readdir').mockResolvedValue(['081.sql', '082.sql'] as never);
    let readFileCount = 0;
    vi.spyOn(fsMod, 'readFile').mockImplementation(async () => {
      readFileCount++;
      return Buffer.from('CREATE TABLE test_x (id INTEGER);');
    });
    vi.spyOn(fsMod, 'copyFile').mockResolvedValue(undefined);
    vi.spyOn(fsMod, 'stat').mockResolvedValue({ size: 100 } as never);
    vi.spyOn(fsMod, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fsMod, 'rm').mockResolvedValue(undefined);

    let migrationRunCount = 0;
    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        run: vi.fn().mockImplementation(() => {
          if (sql.includes('CREATE TABLE')) {
            migrationRunCount++;
            if (migrationRunCount === 2) {
              throw new Error('UNIQUE constraint failed: test_x.id');
            }
          }
        }),
      })),
      transaction: vi.fn().mockImplementation((fn: () => void) => { return () => fn(); }),
    };

    const mgr = new PatchManager(DATA_PATH, DB_PATH, stateStore as never);
    const result = await mgr.apply(
      EXTRACTED_DIR, manifest082, '1.0.0', new Set<number>(), db as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Migration 82|UNIQUE constraint/i);
  });
});

// ── Scenario 3: Health check timeout ──────────────────────────────────────────

describe('Chaos Scenario 3 — health check timeout', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rolls back when health check hangs past HEALTH_CHECK_TIMEOUT_MS', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();
    const db = makeMockDb();

    vi.spyOn(fsMod, 'readdir').mockResolvedValue(['081.sql'] as never);
    vi.spyOn(fsMod, 'readFile').mockResolvedValue(Buffer.from('CREATE TABLE test_hc (id INTEGER);') as never);
    vi.spyOn(fsMod, 'copyFile').mockResolvedValue(undefined);
    vi.spyOn(fsMod, 'stat').mockResolvedValue({ size: 100 } as never);
    vi.spyOn(fsMod, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fsMod, 'rm').mockResolvedValue(undefined);

    // Mock runPostUpdateHealthCheck to hang forever
    vi.mock('./PostUpdateHealthCheck.js', () => ({
      runPostUpdateHealthCheck: () => new Promise(() => { /* never resolves */ }),
    }));

    const applyPromise = new PatchManager(DATA_PATH, DB_PATH, stateStore as never).apply(
      EXTRACTED_DIR, baseManifest, '1.0.0', new Set<number>(), db as never,
    );

    // Advance past the 30s health-check timeout
    await vi.runAllTimersAsync();
    const result = await applyPromise;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Health check timed out/i);
    const finalState = stateStore._getState();
    expect(finalState.updateInProgress).toBe(false);
  });
});

// ── Scenario 4: Rollback failure → SAFE_MODE ──────────────────────────────────

describe('Chaos Scenario 4 — rollback fails, enters SAFE_MODE', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('enters SAFE_MODE when the recovery point file is missing during rollback', async () => {
    const { PatchRollbackManager } = await import('./PatchRollbackManager.js');
    const stateStore = makeMockStateStore();

    // Seed a recovery point that "exists" in the store but file is missing
    (stateStore.read as ReturnType<typeof vi.fn>).mockResolvedValue({
      currentVersion:   '1.0.0',
      channel:          'stable',
      lastCheckedAt:    null,
      pendingManifest:  null,
      rollback:         null,
      updateInProgress: true,
      systemState:      'ROLLING_BACK',
      recoveryPoints:   [{
        id:               'test-rp-id',
        version:          '1.0.0',
        createdAt:        new Date().toISOString(),
        dbSnapshotPath:   join(DATA_PATH, 'recovery-points', 'rp-test-rp-id.db'),
        dbSnapshotSha256: 'abc123',
        sizeBytes:        1000,
      }],
    });

    // Make readFile throw ENOENT — file was deleted
    vi.spyOn(fsMod, 'readFile').mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );
    vi.spyOn(fsMod, 'copyFile').mockResolvedValue(undefined);

    const mgr = new PatchRollbackManager(DATA_PATH, stateStore as never);
    const result = await mgr.rollbackPatch(DB_PATH);

    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/safe mode|ENOENT/i);

    const finalState = stateStore._getState();
    expect(finalState.systemState).toBe('SAFE_MODE');
  });
});
