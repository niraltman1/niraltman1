/**
 * Pre-flight hygiene utilities for the OTA update flow.
 *
 * Runs as "Phase 0" before any download or install to avoid
 * "File In Use" errors caused by partial downloads or zombie processes
 * from a previous failed update attempt.
 */

import { readdir, unlink, rm, open, statfs } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';

// ---------------------------------------------------------------------------
// Orphaned file cleanup
// ---------------------------------------------------------------------------

/**
 * Deletes partial installer files (.tmp, incomplete .exe downloads) and
 * abandoned temp directories from the given directories.
 *
 * Returns the total number of file-system entries deleted.
 */
export async function cleanOrphanedFiles(dirs: string[]): Promise<number> {
  let deleted = 0;
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // directory doesn't exist — nothing to clean
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory() && entry.name.endsWith('.tmp')) {
        await rm(fullPath, { recursive: true, force: true }).catch(() => undefined);
        deleted++;
        continue;
      }

      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        // .tmp files are always orphaned
        // .exe files that begin with "installer-" are download artifacts —
        // we delete the ones that are clearly partial (0-byte or left from
        // a failed attempt).  A valid downloaded installer will be renamed
        // to a version-stamped name by UpdateDownloader before we get here.
        if (ext === '.tmp') {
          await unlink(fullPath).catch(() => undefined);
          deleted++;
        } else if (ext === '.exe' && entry.name.startsWith('installer-')) {
          // Leave the file if it looks complete (stat the size).
          // Delete it only if it is 0 bytes — a sure sign of a partial write.
          try {
            const fh = await open(fullPath, 'r');
            const { size } = await fh.stat();
            await fh.close();
            if (size === 0) {
              await unlink(fullPath).catch(() => undefined);
              deleted++;
            }
          } catch {
            // Can't stat — file is probably locked by a zombie; skip it here
            // and let killZombieInstallers handle it.
          }
        }
      }
    }
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Zombie installer detection & termination (Windows only)
// ---------------------------------------------------------------------------

interface ZombieProcess {
  pid: number;
  name: string;
}

/**
 * Uses PowerShell to list processes whose executable path is inside
 * `updatesDir` (e.g. a previously downloaded installer that is still running).
 * Returns an empty array on non-Windows platforms.
 */
function listZombieInstallers(updatesDir: string): Promise<ZombieProcess[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);

  // Escape single quotes for PS string literal
  const escapedDir = updatesDir.replace(/'/g, "''");
  const psScript = [
    `$p = Get-Process | Where-Object { $_.Path -like '${escapedDir}\\*' }`,
    'if ($p) { $p | Select-Object Id,Name | ConvertTo-Json -Compress } else { "[]" }',
  ].join('; ');

  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { timeout: 5_000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve([]);
          return;
        }
        try {
          const raw: unknown = JSON.parse(stdout.trim());
          // ConvertTo-Json outputs an object (not array) when there is only one result
          const items = Array.isArray(raw) ? raw : [raw];
          const zombies: ZombieProcess[] = (items as Array<Record<string, unknown>>)
            .filter((x) => typeof x['Id'] === 'number' && typeof x['Name'] === 'string')
            .map((x) => ({ pid: x['Id'] as number, name: x['Name'] as string }));
          resolve(zombies);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

/**
 * Detects and terminates any installer processes running from `updatesDir`.
 * Safe no-op on non-Windows environments.
 *
 * Returns display strings for each process that was killed
 * (e.g. `"installer-1.2.3.exe (PID 5432)"`).
 */
export async function killZombieInstallers(updatesDir: string): Promise<string[]> {
  const zombies = await listZombieInstallers(updatesDir);
  const killed: string[] = [];

  for (const zombie of zombies) {
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/F', '/PID', String(zombie.pid)], { timeout: 5_000 }, () => resolve());
    });
    killed.push(`${zombie.name} (PID ${zombie.pid})`);
  }

  return killed;
}

// ---------------------------------------------------------------------------
// Disk-space check
// ---------------------------------------------------------------------------

export interface DiskCheckResult {
  ok: boolean;
  freeMb: number;
}

/**
 * Returns whether the filesystem hosting `dir` has at least `minMb` MB free.
 * Returns `{ ok: false, freeMb: 0 }` if `statfs` is unavailable or fails.
 */
export async function checkDiskSpace(dir: string, minMb: number): Promise<DiskCheckResult> {
  try {
    const stats = await statfs(dir);
    const freeMb = Math.floor((stats.bavail * stats.bsize) / (1024 * 1024));
    return { ok: freeMb >= minMb, freeMb };
  } catch {
    return { ok: false, freeMb: 0 };
  }
}

// ---------------------------------------------------------------------------
// SQLite lock check with retry
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Waits until the SQLite database file at `dbPath` can be opened for reading,
 * or until `maxWaitMs` has elapsed.
 *
 * If the file is not accessible after the timeout we proceed anyway —
 * this is best-effort protection against "database is locked" errors during
 * the update flow.
 */
export async function waitForDbUnlock(dbPath: string, maxWaitMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const fh = await open(dbPath, 'r');
      await fh.close();
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EBUSY' || code === 'EACCES') {
        await sleep(500);
        continue;
      }
      // ENOENT or other — db file absent or different error, proceed
      return;
    }
  }
  // Timed out — proceed best-effort
}
