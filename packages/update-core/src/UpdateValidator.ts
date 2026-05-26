/**
 * UpdateValidator — validates a staged update before it is applied and
 * prepares rollback metadata so the previous version can be restored if needed.
 *
 * All logic is local — no network calls.
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  VersionManifest,
  UpdateState,
  UpdateValidationResult,
  RollbackMetadata,
} from './types.js';
import { VersionManifestParser } from './VersionManifest.js';
import { generateUUID, utcNow } from '@factum-il/shared';

export class UpdateValidator {
  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validates a staged update manifest against the current application state.
   *
   * Rules checked:
   *   Error conditions (block the update):
   *     1. Manifest version must be strictly greater than current version
   *     2. An update must not already be in progress
   *     3. The manifest channel must match the currently configured channel
   *     4. The asset URL must use HTTPS
   *
   *   Warning conditions (inform the user but do not block):
   *     1. No rollback artefacts available → can't roll back if update fails
   *     2. This update is mandatory (from both manifest flag and version comparison)
   */
  static validate(
    manifest: VersionManifest,
    currentState: UpdateState,
  ): UpdateValidationResult {
    const errors:   string[] = [];
    const warnings: string[] = [];

    // Error: update already in progress
    if (currentState.updateInProgress) {
      errors.push('עדכון כבר מתבצע — לא ניתן להתחיל עדכון נוסף במקביל');
    }

    // Error: new version must be greater than current
    const versionComparison = VersionManifestParser.compareVersions(
      manifest.latestVersion,
      currentState.currentVersion,
    );
    if (versionComparison !== 1) {
      errors.push(
        `גרסת העדכון (${manifest.latestVersion}) אינה חדשה יותר מהגרסה הנוכחית (${currentState.currentVersion})`,
      );
    }

    // Error: channel mismatch
    if (manifest.channel !== currentState.channel) {
      errors.push(
        `ערוץ המניפסט (${manifest.channel}) אינו תואם לערוץ המוגדר (${currentState.channel})`,
      );
    }

    // Error: asset URL must use HTTPS
    if (!manifest.assetUrl.startsWith('https://')) {
      errors.push('כתובת ההורדה חייבת להשתמש ב-HTTPS');
    }

    // Warning: no rollback available
    if (currentState.rollback === null || !currentState.rollback.rollbackAvailable) {
      warnings.push('אין גיבוי גרסה קודמת — לא יהיה ניתן לבצע rollback אוטומטי אם העדכון ייכשל');
    }

    // Warning: mandatory update
    if (
      manifest.mandatory ||
      VersionManifestParser.isMandatoryUpdate(manifest, currentState.currentVersion)
    ) {
      warnings.push('זהו עדכון חובה — השימוש ביישום ייחסם עד להשלמת העדכון');
    }

    return {
      valid:    errors.length === 0,
      errors,
      warnings,
    };
  }

  // ---------------------------------------------------------------------------
  // Rollback preparation
  // ---------------------------------------------------------------------------

  /**
   * Copies the SQLite database to a timestamped backup file and returns
   * rollback metadata so the update can be undone if it fails.
   *
   * The backup is written to: {dataPath}/backups/pre-update-{uuid}.db
   * The caller is responsible for preserving the installer binary separately.
   */
  static async prepareRollback(
    currentVersion: string,
    dbPath: string,
    dataPath: string,
  ): Promise<RollbackMetadata> {
    const backupDir = join(dataPath, 'backups');
    await mkdir(backupDir, { recursive: true });

    const backupName   = `pre-update-${generateUUID()}.db`;
    const dbBackupPath = join(backupDir, backupName);

    // Check source DB exists before copying
    let dbExists = false;
    try {
      await stat(dbPath);
      dbExists = true;
    } catch {
      dbExists = false;
    }

    if (dbExists) {
      await copyFile(dbPath, dbBackupPath);
    }

    // Installer path: the caller should place the previous installer here
    // before applying the update.  We record the expected path now.
    const installerName    = `installer-${currentVersion}.exe`;
    const installerPath    = join(dataPath, 'backups', installerName);

    const installerExists = await stat(installerPath).then(() => true).catch(() => false);

    return {
      previousVersion:   currentVersion,
      installedAt:       utcNow(),
      installerPath,
      dbBackupPath,
      rollbackAvailable: dbExists && installerExists,
    };
  }
}
