/**
 * Automated Backup Scheduler
 *
 * Creates a WAL checkpoint + SQLite VACUUM snapshot on a configurable interval.
 * Snapshots are stored in the /backups directory (relative to DB path).
 *
 * Configuration (environment variables):
 *   BACKUP_INTERVAL_MS   — milliseconds between snapshots (default: 3 600 000 = 1 hour)
 *   BACKUP_MAX_KEEP      — number of snapshots to retain (default: 24)
 *   BACKUP_DIR           — override backup directory (default: <db_dir>/backups)
 *
 * Snapshot naming: factum-il-<YYYYMMDD-HHmmss>.db
 *
 * Integration: call startBackupScheduler(repos) from start.ts after server.listen.
 */

import { copyFile, mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Repos } from '../db.js';
import { encryptAES256GCM, deriveBackupKey } from '../modules/security/index.js';
import { withWriteLock } from './write-mutex.js';
import { emitActivity } from './activity-emitter.js';
import { logger } from '@factum-il/shared';

const INTERVAL_MS = Number(process.env['BACKUP_INTERVAL_MS'] ?? 3_600_000);
const MAX_KEEP    = Number(process.env['BACKUP_MAX_KEEP']    ?? 24);

function timestampStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '-',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

async function pruneOldSnapshots(backupDir: string): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(backupDir))
      .filter((f) => f.startsWith('factum-il-') && f.endsWith('.db'))
      .sort(); // lexicographic = chronological for our naming scheme
  } catch {
    return;
  }

  const toDelete = files.slice(0, Math.max(0, files.length - MAX_KEEP));
  for (const f of toDelete) {
    try { await unlink(join(backupDir, f)); } catch { /* ignore */ }
  }
}

async function takeSnapshot(repos: Repos, backupDir: string, resolvedDbPath: string): Promise<void> {
  await mkdir(backupDir, { recursive: true });

  const snapName = `factum-il-${timestampStr()}.db`;
  const snapPath = join(backupDir, snapName);

  await withWriteLock('backup-scheduler:snapshot', async () => {
    // TRUNCATE checkpoint inside the mutex flushes WAL and resets it
    try {
      repos.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').run();
      repos.db.prepare('PRAGMA incremental_vacuum(1000)').run();
    } catch { /* non-fatal */ }
    await copyFile(resolvedDbPath, snapPath);
  });

  let isEncrypted = false;
  let encIv:         string | undefined;
  let encTag:        string | undefined;
  let keyDerivation: string | undefined;
  let finalPath = snapPath;

  if (process.env['BACKUP_ENCRYPT'] === '1') {
    try {
      const derived = await deriveBackupKey();
      if (derived) {
        const plaintext = await readFile(snapPath);
        const payload   = encryptAES256GCM(plaintext, derived.key);
        const encPath   = `${snapPath}.enc`;
        await writeFile(encPath, payload.ciphertext);
        await unlink(snapPath);
        isEncrypted   = true;
        encIv         = payload.iv;
        encTag        = payload.tag;
        keyDerivation = derived.source;
        finalPath     = encPath;
        logger.info(`Backup snapshot encrypted (${derived.source}): ${snapName}.enc`, { category: 'system' });
      }
    } catch (e) {
      logger.warn(`Backup encryption failed — keeping plaintext: ${e instanceof Error ? e.message : String(e)}`, { category: 'system' });
    }
  }

  repos.backups.recordV2(finalPath, 0, 'Automatic scheduled snapshot', {
    isEncrypted, ...(encIv ? { encIv } : {}), ...(encTag ? { encTag } : {}),
    ...(keyDerivation ? { keyDerivation } : {}),
  });

  await pruneOldSnapshots(backupDir);

  emitActivity(repos, {
    kind:    'sync_completed',
    source:  'scheduler:backup',
    message: `Snapshot saved: ${snapName}`,
    details: { encrypted: isEncrypted },
  });
  logger.info(`Backup snapshot saved: ${snapName}`, { category: 'system' });
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startBackupScheduler(repos: Repos, dbPath?: string): void {
  if (_timer) return;

  const resolvedDbPath = dbPath
    ?? (repos.db as unknown as { path?: string }).path
    ?? join(process.cwd(), '_data', 'factum-il.db');

  const backupDir = process.env['BACKUP_DIR'] ?? join(dirname(resolvedDbPath), 'backups');

  logger.info(`Backup scheduler started — every ${INTERVAL_MS / 60_000}min, keep ${MAX_KEEP}, dir: ${backupDir}`, { category: 'system' });

  // Take one snapshot at startup, then on interval
  void takeSnapshot(repos, backupDir, resolvedDbPath);

  _timer = setInterval(() => void takeSnapshot(repos, backupDir, resolvedDbPath), INTERVAL_MS);
  _timer.unref(); // Don't prevent clean shutdown
}

export function stopBackupScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('Backup scheduler stopped', { category: 'system' });
  }
}
