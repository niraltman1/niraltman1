import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { mkdir, writeFile, mkdtemp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock child_process before importing cleanup-utils
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock statfs for disk checks
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    statfs: vi.fn(),
  };
});

import {
  cleanOrphanedFiles,
  killZombieInstallers,
  checkDiskSpace,
  waitForDbUnlock,
} from '../cleanup-utils.js';
import { execFile } from 'node:child_process';
import { statfs, open } from 'node:fs/promises';

const mockExecFile = vi.mocked(execFile);
const mockStatfs   = vi.mocked(statfs);

describe('cleanOrphanedFiles', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'factum-test-'));
  });

  afterEach(async () => {
    // Best-effort cleanup
    await import('node:fs/promises').then((fs) => fs.rm(tmpDir, { recursive: true, force: true }));
    vi.restoreAllMocks();
  });

  it('deletes .tmp files in the target directory', async () => {
    const tmpFile = join(tmpDir, 'partial-download.tmp');
    await writeFile(tmpFile, 'garbage');

    const deleted = await cleanOrphanedFiles([tmpDir]);

    expect(deleted).toBe(1);
    await expect(stat(tmpFile)).rejects.toThrow();
  });

  it('deletes 0-byte installer-.exe files (incomplete downloads)', async () => {
    const exeFile = join(tmpDir, 'installer-1.2.0.exe');
    await writeFile(exeFile, ''); // 0 bytes — incomplete download

    const deleted = await cleanOrphanedFiles([tmpDir]);

    expect(deleted).toBe(1);
    await expect(stat(exeFile)).rejects.toThrow();
  });

  it('preserves non-zero installer-.exe files (complete downloads)', async () => {
    const exeFile = join(tmpDir, 'installer-1.2.0.exe');
    await writeFile(exeFile, Buffer.alloc(1024, 0xab)); // 1 KB — looks complete

    const deleted = await cleanOrphanedFiles([tmpDir]);

    expect(deleted).toBe(0);
    await expect(stat(exeFile)).resolves.toBeDefined();
  });

  it('removes .tmp directories recursively', async () => {
    const tmpSubDir = join(tmpDir, 'extract-stage.tmp');
    await mkdir(tmpSubDir);
    await writeFile(join(tmpSubDir, 'nested.dat'), 'data');

    const deleted = await cleanOrphanedFiles([tmpDir]);

    expect(deleted).toBe(1);
    await expect(stat(tmpSubDir)).rejects.toThrow();
  });

  it('scans multiple directories independently', async () => {
    const dir2 = await mkdtemp(join(tmpdir(), 'factum-test2-'));
    try {
      await writeFile(join(tmpDir,  'a.tmp'), 'junk');
      await writeFile(join(dir2, 'b.tmp'), 'junk');

      const deleted = await cleanOrphanedFiles([tmpDir, dir2]);
      expect(deleted).toBe(2);
    } finally {
      await import('node:fs/promises').then((fs) => fs.rm(dir2, { recursive: true, force: true }));
    }
  });

  it('is a no-op and returns 0 when directory does not exist', async () => {
    const missing = join(tmpdir(), 'does-not-exist-xyz-123');
    const deleted = await cleanOrphanedFiles([missing]);
    expect(deleted).toBe(0);
  });

  // ── Chaos Scenario: orphaned files created by failed update ───────────────
  it('Chaos: cleans multiple orphan files left by a crashed installer download', async () => {
    // Simulate a scenario where 3 temp/partial files were left behind
    await writeFile(join(tmpDir, 'installer-1.1.0.exe'), '');        // 0-byte partial
    await writeFile(join(tmpDir, 'checksum.tmp'), 'abc123');           // temp checksum
    await writeFile(join(tmpDir, 'progress.tmp'), '50%');              // temp progress
    await writeFile(join(tmpDir, 'installer-1.2.0.exe'), Buffer.alloc(512 * 1024)); // VALID — keep

    const deleted = await cleanOrphanedFiles([tmpDir]);

    expect(deleted).toBe(3);
    // The valid installer must survive
    await expect(stat(join(tmpDir, 'installer-1.2.0.exe'))).resolves.toBeDefined();
  });
});

describe('killZombieInstallers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array on non-Windows platforms without calling any process', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    const killed = await killZombieInstallers('/data/updates');

    expect(killed).toEqual([]);
    expect(mockExecFile).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('Chaos: kills zombie installer processes on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    // First execFile call → PowerShell listing returns one process
    mockExecFile
      .mockImplementationOnce((_file, _args, _opts, cb) => {
        // Type-safe: execFile callback signature
        (cb as (...args: unknown[]) => void)(
          null,
          '[{"Id":5432,"Name":"installer-1.2.3.exe"}]',
          '',
        );
        return {} as ReturnType<typeof execFile>;
      })
      // Second call → taskkill succeeds
      .mockImplementationOnce((_file, _args, _opts, cb) => {
        (cb as (...args: unknown[]) => void)(null, '', '');
        return {} as ReturnType<typeof execFile>;
      });

    const killed = await killZombieInstallers('C:\\FactumIL\\data\\updates');

    expect(killed).toHaveLength(1);
    expect(killed[0]).toContain('PID 5432');

    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  it('returns empty array when PowerShell finds no matching processes', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    mockExecFile.mockImplementationOnce((_file, _args, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(null, '[]', '');
      return {} as ReturnType<typeof execFile>;
    });

    const killed = await killZombieInstallers('C:\\FactumIL\\data\\updates');
    expect(killed).toEqual([]);

    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });

  it('returns empty array when PowerShell errors out', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    mockExecFile.mockImplementationOnce((_file, _args, _opts, cb) => {
      (cb as (...args: unknown[]) => void)(new Error('PowerShell not found'), '', '');
      return {} as ReturnType<typeof execFile>;
    });

    const killed = await killZombieInstallers('C:\\FactumIL\\data\\updates');
    expect(killed).toEqual([]);

    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  });
});

describe('checkDiskSpace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok=true when free space exceeds threshold', async () => {
    mockStatfs.mockResolvedValueOnce({
      type:    1,
      bsize:   4096,
      blocks:  1000000,
      bfree:   500000,
      bavail:  500000, // 500000 * 4096 / 1024 / 1024 ≈ 1953 MB
      files:   100000,
      ffree:   90000,
    } as Awaited<ReturnType<typeof statfs>>);

    const result = await checkDiskSpace('/some/dir', 200);
    expect(result.ok).toBe(true);
    expect(result.freeMb).toBeGreaterThanOrEqual(200);
  });

  it('returns ok=false when free space is below threshold', async () => {
    mockStatfs.mockResolvedValueOnce({
      type:    1,
      bsize:   4096,
      blocks:  100000,
      bfree:   10000,
      bavail:  10000, // 10000 * 4096 / 1024 / 1024 ≈ 39 MB
      files:   100000,
      ffree:   90000,
    } as Awaited<ReturnType<typeof statfs>>);

    const result = await checkDiskSpace('/some/dir', 200);
    expect(result.ok).toBe(false);
    expect(result.freeMb).toBeLessThan(200);
  });

  it('returns ok=false with freeMb=0 when statfs throws', async () => {
    mockStatfs.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await checkDiskSpace('/no/such/dir', 200);
    expect(result.ok).toBe(false);
    expect(result.freeMb).toBe(0);
  });
});

describe('waitForDbUnlock', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'factum-db-test-'));
  });

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(tmpDir, { recursive: true, force: true }));
  });

  it('resolves immediately when db file is accessible', async () => {
    const dbFile = join(tmpDir, 'test.db');
    await writeFile(dbFile, 'SQLite db placeholder');

    const start = Date.now();
    await waitForDbUnlock(dbFile, 5_000);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('resolves immediately when db file does not exist (no-op)', async () => {
    const start = Date.now();
    await waitForDbUnlock(join(tmpDir, 'nonexistent.db'), 5_000);
    expect(Date.now() - start).toBeLessThan(200);
  });
});
