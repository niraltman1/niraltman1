/**
 * Patch Chaos Tests — four must-pass scenarios from PATCH_CHAOS_TEST_PLAN.md.
 * All filesystem/DB operations are mocked. No real files or databases are used.
 *
 * vi.spyOn() cannot mock ESM named exports — use vi.mock() (Vitest hoists it above imports).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// ── Module-level mocks (hoisted by Vitest above imports) ──────────────────────

vi.mock('node:fs/promises', () => ({
  readdir:  vi.fn(),
  readFile: vi.fn(),
  copyFile: vi.fn(),
  stat:     vi.fn(),
  mkdir:    vi.fn(),
  rm:       vi.fn(),
}));

vi.mock('./PostUpdateHealthCheck.js', () => ({
  runPostUpdateHealthCheck: vi.fn(),
}));

// PatchValidator does real Ed25519 + SHA-256 checks which require valid keys/hashes.
// Chaos tests exercise steps 5-9 (recovery point, apply, migrations, health, rollback),
// not the validation step — mock it to always pass so we reach the target chaos point.
vi.mock('./PatchValidator.js', () => ({
  PatchValidator: {
    validate: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  },
}));

// Import mocked modules AFTER vi.mock() declarations
import * as fsMod from 'node:fs/promises';
import { runPostUpdateHealthCheck } from './PostUpdateHealthCheck.js';

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

// Scenario 1 uses a non-migration file so Apply Files (step 6) actually calls copyFile.
// baseManifest only has migration files, which step 6 skips (they run in step 7).
const baseManifestWithFile = {
  ...baseManifest,
  migrations: [],
  sha256map:  { 'files/test.json': 'abc123' },
};

function makeMockDb() {
  return {
    prepare:     vi.fn().mockReturnValue({ run: vi.fn() }),
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
    read:      vi.fn().mockImplementation(async () => ({ ...state })),
    write:     vi.fn().mockImplementation(async (partial: Partial<typeof state>) => {
      state = { ...state, ...partial };
    }),
    _getState: () => state,
  };
}

function setupDefaultFsMocks() {
  vi.mocked(fsMod.readdir).mockResolvedValue(['081.sql'] as never);
  // Return a string (not Buffer) so sql.trim() works when PatchManager reads migration files
  vi.mocked(fsMod.readFile).mockResolvedValue('CREATE TABLE test (id INTEGER);' as never);
  vi.mocked(fsMod.copyFile).mockResolvedValue(undefined);
  vi.mocked(fsMod.stat).mockResolvedValue({ size: 100 } as never);
  vi.mocked(fsMod.mkdir).mockResolvedValue(undefined);
  vi.mocked(fsMod.rm).mockResolvedValue(undefined);
  vi.mocked(runPostUpdateHealthCheck).mockResolvedValue({
    healthy: true, wasApplied: false, failures: [],
  } as never);
}

// ── Scenario 1: Disk full during patch apply ──────────────────────────────────

describe('Chaos Scenario 1 — disk full during Apply Files', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDefaultFsMocks(); });

  it('rolls back cleanly when disk is full during file apply (ENOSPC)', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();
    const db = makeMockDb();

    // No migration files so step 7 is a no-op; ENOSPC hits in step 6 (Apply Files)
    vi.mocked(fsMod.readdir).mockResolvedValue([] as never);

    let copyCallCount = 0;
    vi.mocked(fsMod.copyFile).mockImplementation(async () => {
      copyCallCount++;
      if (copyCallCount === 2) {
        // First copyFile = recovery point DB backup; second = applying files/test.json
        throw Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
      }
    });

    const mgr = new PatchManager(DATA_PATH, DB_PATH, stateStore as never);
    const result = await mgr.apply(
      EXTRACTED_DIR, baseManifestWithFile, '1.0.0', new Set<number>(), db as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No space left|ENOSPC/i);
    const finalState = stateStore._getState();
    expect(['NORMAL', 'SAFE_MODE']).toContain(finalState.systemState);
  });
});

// ── Scenario 2: Migration cascade failure ─────────────────────────────────────

describe('Chaos Scenario 2 — migration cascade failure', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDefaultFsMocks(); });

  it('rolls back when migration 082 fails after 081 succeeded', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();

    const manifest082 = {
      ...baseManifest,
      migrations: [81, 82],
      sha256map: { 'migrations/081.sql': 'abc', 'migrations/082.sql': 'def' },
    };

    vi.mocked(fsMod.readdir).mockResolvedValue(['081.sql', '082.sql'] as never);

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
      transaction: vi.fn().mockImplementation((fn: () => void) => () => fn()),
    };

    const mgr = new PatchManager(DATA_PATH, DB_PATH, stateStore as never);
    const result = await mgr.apply(
      EXTRACTED_DIR, manifest082, '1.0.0', new Set<number>(), db as never,
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Migration 82|UNIQUE constraint/i);
  });
});

// ── Scenario 3: Health check timeout ─────────────────────────────────────────

describe('Chaos Scenario 3 — health check timeout', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDefaultFsMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rolls back when health check hangs past HEALTH_CHECK_TIMEOUT_MS', async () => {
    const { PatchManager } = await import('./PatchManager.js');
    const stateStore = makeMockStateStore();
    const db = makeMockDb();

    // Override: health check never resolves
    vi.mocked(runPostUpdateHealthCheck).mockImplementation(() => new Promise(() => { /* hangs */ }));

    const applyPromise = new PatchManager(DATA_PATH, DB_PATH, stateStore as never).apply(
      EXTRACTED_DIR, baseManifest, '1.0.0', new Set<number>(), db as never,
    );

    // Advance past the 30s health-check timeout constant in PatchManager
    await vi.runAllTimersAsync();
    const result = await applyPromise;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Health check timed out/i);
    const finalState = stateStore._getState();
    expect(finalState.updateInProgress).toBe(false);
  });
});

// ── Scenario 4: Rollback failure → SAFE_MODE ─────────────────────────────────

describe('Chaos Scenario 4 — rollback fails, enters SAFE_MODE', () => {
  beforeEach(() => { vi.clearAllMocks(); setupDefaultFsMocks(); });

  it('enters SAFE_MODE when the recovery point file is missing during rollback', async () => {
    const { PatchRollbackManager } = await import('./PatchRollbackManager.js');
    const stateStore = makeMockStateStore();

    // Seed a recovery point that "exists" in the store but file is gone on disk
    vi.mocked(stateStore.read).mockResolvedValue({
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
    } as never);

    // readFile throws ENOENT — recovery point file was deleted
    vi.mocked(fsMod.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );

    const mgr = new PatchRollbackManager(DATA_PATH, stateStore as never);
    const result = await mgr.rollbackPatch(DB_PATH);

    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/safe mode|ENOENT/i);
    const finalState = stateStore._getState();
    expect(finalState.systemState).toBe('SAFE_MODE');
  });
});
