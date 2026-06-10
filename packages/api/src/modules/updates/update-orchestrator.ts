/**
 * update-orchestrator — coordinates the full OTA update flow:
 *   [Phase 0] hygiene → validate → backup DB → download → verify → launch installer
 *
 * The installer (Inno Setup .exe) runs silently and replaces the app in-place.
 * The current Node.js process will be terminated by the installer.
 */

import { join } from 'node:path';
import { execFile } from 'node:child_process';
import {
  UpdateValidator,
  UpdateDownloader,
  UpdateStateStore,
  cleanOrphanedFiles,
  killZombieInstallers,
  checkDiskSpace,
  waitForDbUnlock,
  type VersionManifest,
  type DownloadProgress,
} from '@factum-il/update-core';

const MIN_DISK_MB = 200;

export interface OrchestratorCallbacks {
  onProgress?:  (p: DownloadProgress) => void;
  onVerified?:  (sha256: string) => void;
  onLaunching?: () => void;
  onPhase0?:    (detail: Phase0Summary) => void;
}

export interface Phase0Summary {
  orphansDeleted:    number;
  zombiesKilled:     string[];
  diskFreeMb:        number;
  dbUnlockWaitedMs:  number;
}

export interface OrchestratorResult {
  success: boolean;
  error?:  string;
  phase0?: Phase0Summary;
}

export async function startUpdateFlow(
  manifest:   VersionManifest,
  stateStore: UpdateStateStore,
  dataPath:   string,
  dbPath:     string,
  callbacks:  OrchestratorCallbacks = {},
): Promise<OrchestratorResult> {

  // ─── Phase 0: Pre-flight hygiene & readiness ──────────────────────────────
  const updatesDir = join(dataPath, 'updates');

  const [orphansDeleted, zombiesKilled] = await Promise.all([
    cleanOrphanedFiles([updatesDir, join(dataPath, 'api', 'node_modules')]),
    killZombieInstallers(updatesDir),
  ]);

  const diskResult = await checkDiskSpace(updatesDir, MIN_DISK_MB);
  if (!diskResult.ok) {
    return {
      success: false,
      error:   `Insufficient disk space: ${diskResult.freeMb} MB free, ${MIN_DISK_MB} MB required.`,
    };
  }

  const dbUnlockStart = Date.now();
  await waitForDbUnlock(dbPath, 5_000);
  const dbUnlockWaitedMs = Date.now() - dbUnlockStart;

  const phase0: Phase0Summary = {
    orphansDeleted,
    zombiesKilled,
    diskFreeMb:       diskResult.freeMb,
    dbUnlockWaitedMs,
  };
  callbacks.onPhase0?.(phase0);

  // ─── Phase 1: Validate ────────────────────────────────────────────────────
  const state = await stateStore.read();
  const validation = UpdateValidator.validate(manifest, state);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; '), phase0 };
  }

  // ─── Phase 2: Mark in-progress ────────────────────────────────────────────
  await stateStore.write({ updateInProgress: true });

  try {
    // Phase 3: Prepare rollback backup — persist the metadata so a later
    // POST /api/updates/rollback can find and verify the snapshot. Discarding
    // it here would leave `rollbackAvailable` permanently false even though
    // the backup was taken.
    const rollback = await UpdateValidator.prepareRollback(state.currentVersion, dbPath, dataPath);
    await stateStore.write({ rollback });

    // Phase 4: Download + verify
    const downloader = new UpdateDownloader(dataPath);
    const { filePath } = await downloader.download(manifest, callbacks.onProgress);
    callbacks.onVerified?.(manifest.sha256);

    // Phase 5: Persist pending manifest
    await stateStore.write({ pendingManifest: manifest });

    // Phase 6: Launch installer silently — it will overwrite and restart the app
    callbacks.onLaunching?.();
    execFile(filePath, ['/SILENT', '/CLOSEAPPLICATIONS'], (err) => {
      if (err) {
        void stateStore.write({ updateInProgress: false });
      }
    });

    return { success: true, phase0 };
  } catch (err) {
    await stateStore.write({ updateInProgress: false });
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
      phase0,
    };
  }
}
