/**
 * update-orchestrator — coordinates the full OTA update flow:
 *   validate → backup DB → download → verify → launch installer
 *
 * The installer (Inno Setup .exe) runs silently and replaces the app in-place.
 * The current Node.js process will be terminated by the installer.
 */

import { execFile } from 'node:child_process';
import {
  UpdateValidator,
  UpdateDownloader,
  UpdateStateStore,
  type VersionManifest,
  type DownloadProgress,
} from '@factum-il/update-core';

export interface OrchestratorCallbacks {
  onProgress?: (p: DownloadProgress) => void;
  onVerified?: (sha256: string) => void;
  onLaunching?: () => void;
}

export interface OrchestratorResult {
  success: boolean;
  error?:  string;
}

export async function startUpdateFlow(
  manifest: VersionManifest,
  stateStore: UpdateStateStore,
  dataPath: string,
  dbPath: string,
  callbacks: OrchestratorCallbacks = {},
): Promise<OrchestratorResult> {
  const state = await stateStore.read();

  // 1. Validate
  const validation = UpdateValidator.validate(manifest, state);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  // 2. Mark in-progress
  await stateStore.write({ updateInProgress: true });

  try {
    // 3. Prepare rollback backup
    await UpdateValidator.prepareRollback(state.currentVersion, dbPath, dataPath);

    // 4. Download + verify
    const downloader = new UpdateDownloader(dataPath);
    const { filePath } = await downloader.download(manifest, callbacks.onProgress);
    callbacks.onVerified?.(manifest.sha256);

    // 5. Persist pending manifest
    await stateStore.write({ pendingManifest: manifest });

    // 6. Launch installer silently — it will overwrite and restart the app
    callbacks.onLaunching?.();
    execFile(filePath, ['/SILENT', '/CLOSEAPPLICATIONS'], (err) => {
      if (err) {
        // Non-fatal from our perspective: log and let the UI surface the error
        // via the SSE stream. If the installer doesn't restart us, the user
        // must relaunch manually.
        void stateStore.write({ updateInProgress: false });
      }
    });

    return { success: true };
  } catch (err) {
    await stateStore.write({ updateInProgress: false });
    return {
      success: false,
      error:   err instanceof Error ? err.message : String(err),
    };
  }
}
