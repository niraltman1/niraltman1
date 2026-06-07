/**
 * UpdateRollback — restores the previous app version and database snapshot
 * when an applied update needs to be undone.
 *
 * Mirrors two patterns already established elsewhere in the codebase:
 *   - Snapshot verification via `PRAGMA integrity_check`
 *     (see @factum-il/database DatabaseHardening.backup())
 *   - Silent installer launch via `execFile(.., ['/SILENT', '/CLOSEAPPLICATIONS'])`
 *     (see update-orchestrator.startUpdateFlow Phase 6)
 *
 * All logic is local — no network calls.
 */

import { copyFile, stat, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import Database from 'better-sqlite3';
import type { RollbackMetadata } from './types.js';

export interface RollbackResult {
  /** True only when the database snapshot was verified and restored. */
  restored: boolean;

  /** Hebrew explanation of why the rollback could not proceed (when restored=false). */
  reason?: string;

  /** True when the previous version's installer was found and launched. */
  installerLaunched: boolean;
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

/**
 * Opens the snapshot read-only and runs `PRAGMA integrity_check`.
 * A corrupt snapshot must never be swapped in — that would turn a
 * recoverable situation into data loss.
 *
 * `better-sqlite3` throws synchronously (e.g. "file is not a database") when
 * the file isn't a valid SQLite database at all — that counts as "not intact"
 * just as much as a failed PRAGMA result does.
 */
function isDatabaseIntact(path: string): boolean {
  try {
    const verifyDb = new Database(path, { readonly: true });
    try {
      const row = verifyDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      return row.integrity_check === 'ok';
    } finally {
      verifyDb.close();
    }
  } catch {
    return false;
  }
}

/**
 * Launches the previous version's installer silently. Like the forward-update
 * flow, this is fire-and-forget: the installer overwrites the app binaries and
 * restarts the process, so a non-zero exit from `execFile` itself (e.g. the
 * binary couldn't be spawned) is the only thing we observe here.
 */
function launchInstaller(installerPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(installerPath, ['/SILENT', '/CLOSEAPPLICATIONS'], (err) => {
      resolve(!err);
    });
  });
}

/**
 * Restores the database snapshot taken before the update that triggered
 * rollback readiness, then relaunches the previous version's installer so the
 * app binaries match the restored schema.
 *
 * Restoring only the database (without also reinstalling the previous app
 * version) would leave the *new* app build running against an *old* schema —
 * a worse state than doing nothing. Both halves are required for a safe
 * rollback, which is why `rollbackAvailable` requires both artefacts.
 */
export async function restoreFromRollback(
  metadata: RollbackMetadata | null,
  dbPath: string,
): Promise<RollbackResult> {
  if (metadata === null || !metadata.rollbackAvailable) {
    return { restored: false, reason: 'אין נתוני rollback זמינים — לא ניתן לשחזר גרסה קודמת', installerLaunched: false };
  }

  const [dbBackupExists, installerExists] = await Promise.all([
    fileExists(metadata.dbBackupPath),
    fileExists(metadata.installerPath),
  ]);

  if (!dbBackupExists) {
    return { restored: false, reason: 'קובץ גיבוי מסד הנתונים חסר בדיסק', installerLaunched: false };
  }
  if (!installerExists) {
    return { restored: false, reason: 'קובץ ההתקנה של הגרסה הקודמת חסר בדיסק', installerLaunched: false };
  }

  if (!isDatabaseIntact(metadata.dbBackupPath)) {
    return { restored: false, reason: 'בדיקת שלמות גיבוי מסד הנתונים נכשלה — השחזור בוטל', installerLaunched: false };
  }

  // Remove any stale write-ahead-log files so the restored snapshot is not
  // replayed against a WAL that belongs to a different database generation.
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
  await copyFile(metadata.dbBackupPath, dbPath);

  const installerLaunched = await launchInstaller(metadata.installerPath);

  return { restored: true, installerLaunched };
}
