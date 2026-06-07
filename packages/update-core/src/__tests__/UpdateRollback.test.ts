import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { RollbackMetadata } from '../types.js';

// ─── Mock node:child_process — never actually spawn an installer in tests ────
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// ─── Import subject under test AFTER mocks are set up ────────────────────────
const { restoreFromRollback } = await import('../UpdateRollback.js');

function makeIntactDatabase(path: string): void {
  const db = new Database(path);
  db.prepare('CREATE TABLE Marker (label TEXT)').run();
  db.prepare("INSERT INTO Marker (label) VALUES ('snapshot')").run();
  db.close();
}

describe('restoreFromRollback', () => {
  let tmpDir: string;
  let dbPath: string;
  let backupPath: string;
  let installerPath: string;

  beforeEach(async () => {
    tmpDir        = await mkdtemp(join(tmpdir(), 'factum-rollback-test-'));
    dbPath        = join(tmpDir, 'factum-il.db');
    backupPath    = join(tmpDir, 'pre-update-snapshot.db');
    installerPath = join(tmpDir, 'installer-1.0.0.exe');

    vi.clearAllMocks();
    mockExecFile.mockImplementation((_f: unknown, _a: unknown, cb: (e: null) => void) => cb(null));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeMetadata(overrides: Partial<RollbackMetadata> = {}): RollbackMetadata {
    return {
      previousVersion:   '1.0.0',
      installedAt:       '2026-01-01T00:00:00.000Z',
      installerPath,
      dbBackupPath:      backupPath,
      rollbackAvailable: true,
      ...overrides,
    };
  }

  it('returns restored=false when metadata is null', async () => {
    const result = await restoreFromRollback(null, dbPath);
    expect(result.restored).toBe(false);
    expect(result.installerLaunched).toBe(false);
    expect(result.reason).toMatch(/אין נתוני rollback/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns restored=false when rollbackAvailable is false', async () => {
    const result = await restoreFromRollback(makeMetadata({ rollbackAvailable: false }), dbPath);
    expect(result.restored).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns restored=false when the database snapshot file is missing', async () => {
    await writeFile(installerPath, 'fake-installer-bytes');
    // backupPath intentionally not created

    const result = await restoreFromRollback(makeMetadata(), dbPath);

    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/גיבוי מסד הנתונים חסר/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns restored=false when the previous installer file is missing', async () => {
    makeIntactDatabase(backupPath);
    // installerPath intentionally not created

    const result = await restoreFromRollback(makeMetadata(), dbPath);

    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/קובץ ההתקנה .* חסר/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('refuses to restore a corrupted snapshot — never overwrites the live database', async () => {
    await writeFile(backupPath, 'this is not a valid sqlite file — corrupted bytes');
    await writeFile(installerPath, 'fake-installer-bytes');
    await writeFile(dbPath, 'live-database-must-survive-untouched');

    const result = await restoreFromRollback(makeMetadata(), dbPath);

    expect(result.restored).toBe(false);
    expect(result.reason).toMatch(/בדיקת שלמות/);
    expect(mockExecFile).not.toHaveBeenCalled();

    // The live database must be left exactly as it was.
    expect(await readFile(dbPath, 'utf8')).toBe('live-database-must-survive-untouched');
  });

  it('happy path — restores the verified snapshot and launches the previous installer', async () => {
    makeIntactDatabase(backupPath);
    await writeFile(installerPath, 'fake-installer-bytes');
    await writeFile(dbPath, 'stale-live-database-from-failed-update');
    await writeFile(`${dbPath}-wal`, 'stale-wal');
    await writeFile(`${dbPath}-shm`, 'stale-shm');

    const result = await restoreFromRollback(makeMetadata(), dbPath);

    expect(result.restored).toBe(true);
    expect(result.installerLaunched).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      installerPath,
      ['/SILENT', '/CLOSEAPPLICATIONS'],
      expect.any(Function),
    );

    // The live DB file must now be a byte-for-byte copy of the verified snapshot.
    const restored = new Database(dbPath, { readonly: true });
    try {
      const row = restored.prepare('SELECT label FROM Marker').get() as { label: string };
      expect(row.label).toBe('snapshot');
    } finally {
      restored.close();
    }

    // Stale WAL/SHM must be cleared so they aren't replayed against the snapshot.
    await expect(readFile(`${dbPath}-wal`, 'utf8')).rejects.toThrow();
    await expect(readFile(`${dbPath}-shm`, 'utf8')).rejects.toThrow();
  });

  it('reports installerLaunched=false when execFile fails to spawn the binary', async () => {
    makeIntactDatabase(backupPath);
    await writeFile(installerPath, 'fake-installer-bytes');
    mockExecFile.mockImplementation(
      (_f: unknown, _a: unknown, cb: (e: Error) => void) =>
        cb(Object.assign(new Error('EACCES'), { code: 'EACCES' })),
    );

    const result = await restoreFromRollback(makeMetadata(), dbPath);

    // The database restore itself must still succeed — only the launch failed.
    expect(result.restored).toBe(true);
    expect(result.installerLaunched).toBe(false);
  });
});
