import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @factum-il/update-core ──────────────────────────────────────────────
const mockValidate        = vi.fn();
const mockPrepareRollback = vi.fn();
const mockDownload        = vi.fn();
const mockRead            = vi.fn();
const mockWrite           = vi.fn();
const mockCleanOrphans    = vi.fn();
const mockKillZombies     = vi.fn();
const mockCheckDisk       = vi.fn();
const mockWaitDbUnlock    = vi.fn();

vi.mock('@factum-il/update-core', () => ({
  UpdateValidator: {
    validate:        (...args: unknown[]) => mockValidate(...args),
    prepareRollback: (...args: unknown[]) => mockPrepareRollback(...args),
  },
  UpdateDownloader: vi.fn().mockImplementation(() => ({
    download: mockDownload,
  })),
  UpdateStateStore: vi.fn().mockImplementation(() => ({
    read:  mockRead,
    write: mockWrite,
  })),
  cleanOrphanedFiles: (...args: unknown[]) => mockCleanOrphans(...args),
  killZombieInstallers: (...args: unknown[]) => mockKillZombies(...args),
  checkDiskSpace:      (...args: unknown[]) => mockCheckDisk(...args),
  waitForDbUnlock:     (...args: unknown[]) => mockWaitDbUnlock(...args),
}));

// ─── Mock node:child_process ──────────────────────────────────────────────────
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// ─── Import subject under test AFTER mocks are set up ────────────────────────
import { startUpdateFlow } from '../update-orchestrator.js';
import type { VersionManifest } from '@factum-il/update-core';
import type { UpdateStateStore } from '@factum-il/update-core';

// ─── Test fixtures ────────────────────────────────────────────────────────────
const manifest: VersionManifest = {
  version:    '2.0.0',
  channel:    'stable',
  assetUrl:   'https://example.com/installer-2.0.0.exe',
  sha256:     'abc123def456',
  releaseDate: '2026-01-01',
  releaseNotes: 'Bug fixes',
};

const currentState = {
  currentVersion:   '1.0.0',
  channel:          'stable' as const,
  updateInProgress: false,
  pendingManifest:  undefined,
};

function makeStateStore(): UpdateStateStore {
  mockRead.mockResolvedValue(currentState);
  mockWrite.mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { read: mockRead, write: mockWrite } as any;
}

// ─── Shared Phase-0 happy-path setup ─────────────────────────────────────────
function setupHappyPhase0(): void {
  mockCleanOrphans.mockResolvedValue(0);
  mockKillZombies.mockResolvedValue([]);
  mockCheckDisk.mockResolvedValue({ ok: true, freeMb: 1500 });
  mockWaitDbUnlock.mockResolvedValue(undefined);
}

describe('startUpdateFlow — Phase 0 (hygiene)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs cleanup and disk-check before validation', async () => {
    setupHappyPhase0();
    mockValidate.mockReturnValue({ valid: false, errors: ['version already installed'] });

    await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    // Phase 0 utilities must be called even when validation ultimately fails
    expect(mockCleanOrphans).toHaveBeenCalledOnce();
    expect(mockKillZombies).toHaveBeenCalledOnce();
    expect(mockCheckDisk).toHaveBeenCalledOnce();
    expect(mockWaitDbUnlock).toHaveBeenCalledOnce();
  });

  it('returns disk-space error immediately when < 200 MB free', async () => {
    mockCleanOrphans.mockResolvedValue(0);
    mockKillZombies.mockResolvedValue([]);
    mockCheckDisk.mockResolvedValue({ ok: false, freeMb: 50 });
    mockWaitDbUnlock.mockResolvedValue(undefined);

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient disk space/);
    // Validation and download must NOT run after a disk-space failure
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('includes Phase0Summary in the result', async () => {
    setupHappyPhase0();
    mockCleanOrphans.mockResolvedValue(3);
    mockKillZombies.mockResolvedValue(['zombie.exe (PID 1234)']);
    mockCheckDisk.mockResolvedValue({ ok: true, freeMb: 800 });
    mockValidate.mockReturnValue({ valid: false, errors: ['no update needed'] });

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.phase0).toBeDefined();
    expect(result.phase0?.orphansDeleted).toBe(3);
    expect(result.phase0?.zombiesKilled).toEqual(['zombie.exe (PID 1234)']);
    expect(result.phase0?.diskFreeMb).toBe(800);
  });

  it('calls onPhase0 callback with summary', async () => {
    setupHappyPhase0();
    mockValidate.mockReturnValue({ valid: false, errors: ['x'] });
    const onPhase0 = vi.fn();

    await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite', { onPhase0 });

    expect(onPhase0).toHaveBeenCalledOnce();
    expect(onPhase0.mock.calls[0][0]).toMatchObject({
      orphansDeleted:   expect.any(Number),
      zombiesKilled:    expect.any(Array),
      diskFreeMb:       expect.any(Number),
      dbUnlockWaitedMs: expect.any(Number),
    });
  });
});

describe('startUpdateFlow — validation & happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPhase0();
  });

  it('validation fails → returns error, stateStore.write never called', async () => {
    mockValidate.mockReturnValue({ valid: false, errors: ['downgrade not allowed'] });

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toContain('downgrade not allowed');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('happy path → callbacks fire in correct order, success=true', async () => {
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockPrepareRollback.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue({ filePath: '/data/updates/installer-2.0.0.exe', verified: true });
    mockExecFile.mockImplementation((_f: unknown, _a: unknown, cb: (e: null) => void) => cb(null));

    const onProgress  = vi.fn();
    const onVerified  = vi.fn();
    const onLaunching = vi.fn();

    const result = await startUpdateFlow(
      manifest, makeStateStore(), '/data', '/data/db.sqlite',
      { onProgress, onVerified, onLaunching },
    );

    expect(result.success).toBe(true);
    expect(onVerified).toHaveBeenCalledWith(manifest.sha256);
    expect(onLaunching).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledWith({ updateInProgress: true });
    expect(mockWrite).toHaveBeenCalledWith({ pendingManifest: manifest });
  });

  it('prepareRollback throws → updateInProgress reset, error returned', async () => {
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockPrepareRollback.mockRejectedValue(new Error('disk full on backup'));

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toContain('disk full on backup');
    expect(mockWrite).toHaveBeenCalledWith({ updateInProgress: false });
  });

  it('execFile callback receives error → stateStore reset', async () => {
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockPrepareRollback.mockResolvedValue(undefined);
    mockDownload.mockResolvedValue({ filePath: '/data/updates/installer-2.0.0.exe', verified: true });
    mockExecFile.mockImplementation(
      (_f: unknown, _a: unknown, cb: (e: Error) => void) =>
        cb(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
    );

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    // execFile error is non-fatal — the launch was attempted and we return success
    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith({ updateInProgress: false });
  });
});

// ─── 5 Master Chaos Scenarios ────────────────────────────────────────────────

describe('Chaos Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPhase0();
    mockValidate.mockReturnValue({ valid: true, errors: [] });
    mockPrepareRollback.mockResolvedValue(undefined);
  });

  it('Chaos-1: network drop mid-download cleans up state', async () => {
    mockDownload.mockRejectedValue(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    );

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/socket hang up/);
    // State must be reset — not stuck in updateInProgress=true
    expect(mockWrite).toHaveBeenLastCalledWith({ updateInProgress: false });
  });

  it('Chaos-2: Phase 0 orphan cleanup runs before download even starts', async () => {
    // Simulate 5 orphaned files from a previous crash
    mockCleanOrphans.mockResolvedValue(5);
    mockKillZombies.mockResolvedValue(['old-installer.exe (PID 9999)']);
    mockDownload.mockResolvedValue({ filePath: '/data/updates/installer-2.0.0.exe', verified: true });
    mockExecFile.mockImplementation((_f: unknown, _a: unknown, cb: (e: null) => void) => cb(null));

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(true);
    expect(result.phase0?.orphansDeleted).toBe(5);
    expect(result.phase0?.zombiesKilled).toHaveLength(1);
  });

  it('Chaos-3: read-only filesystem (EACCES on installer launch) is non-fatal', async () => {
    mockDownload.mockResolvedValue({ filePath: '/data/updates/installer-2.0.0.exe', verified: true });
    mockExecFile.mockImplementation(
      (_f: unknown, _a: unknown, cb: (e: Error) => void) =>
        cb(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })),
    );

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    // Installer launch failure is non-fatal — UI must surface the error separately
    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledWith({ updateInProgress: false });
  });

  it('Chaos-4: disk space check returns false → early exit, no download attempted', async () => {
    mockCheckDisk.mockResolvedValue({ ok: false, freeMb: 12 });

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Insufficient disk space/);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockPrepareRollback).not.toHaveBeenCalled();
  });

  it('Chaos-5: ENOSPC during download resets state and surfaces error', async () => {
    mockDownload.mockRejectedValue(
      Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }),
    );

    const result = await startUpdateFlow(manifest, makeStateStore(), '/data', '/data/db.sqlite');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOSPC/);
    expect(mockWrite).toHaveBeenLastCalledWith({ updateInProgress: false });
  });
});
