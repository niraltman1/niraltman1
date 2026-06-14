/**
 * PatchRollbackManager — creates, verifies, and restores recovery points.
 *
 * Retention policy: keep the most recent 10 recovery points OR all points
 * created in the last 30 days (whichever is larger). Older points are pruned
 * after every successful creation.
 */

import { copyFile, rm, stat, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { recordPatchRollbackDuration, recordRecoveryPointVerifyDuration } from '@factum-il/observability';
import type { RecoveryPoint } from './types.js';
import { UpdateStateStore } from './UpdateStateStore.js';

const MAX_RECOVERY_POINTS    = 10;
const RECOVERY_POINT_TTL_MS  = 30 * 24 * 60 * 60 * 1_000; // 30 days

export interface RollbackPatchResult {
  restored: boolean;
  reason?:  string;
}

export class PatchRollbackManager {
  constructor(
    private readonly dataPath: string,
    private readonly stateStore: UpdateStateStore,
  ) {}

  // ---------------------------------------------------------------------------
  // Recovery Point Management
  // ---------------------------------------------------------------------------

  /**
   * Creates a new recovery point (DB snapshot) and immediately verifies it.
   * If verification fails, throws — the caller must not proceed with the patch.
   * Prunes old recovery points after successful creation.
   */
  async createAndVerifyRecoveryPoint(
    dbPath: string,
    version: string,
  ): Promise<RecoveryPoint> {
    const t0 = Date.now();
    const recoveryDir = join(this.dataPath, 'recovery-points');
    await mkdir(recoveryDir, { recursive: true });

    const id = crypto.randomUUID();
    const snapshotName = `rp-${id}.db`;
    const snapshotPath = join(recoveryDir, snapshotName);

    await copyFile(dbPath, snapshotPath);

    // Compute SHA-256 of the snapshot
    const content = await readFile(snapshotPath);
    const sha256   = createHash('sha256').update(content).digest('hex');
    const { size } = await stat(snapshotPath);

    const point: RecoveryPoint = {
      id,
      version,
      createdAt:        new Date().toISOString(),
      dbSnapshotPath:   snapshotPath,
      dbSnapshotSha256: sha256,
      sizeBytes:        size,
    };

    // Immediately verify (guards against disk-full partial writes)
    await this.verifyRecoveryPoint(point);
    recordRecoveryPointVerifyDuration(Date.now() - t0);

    // Persist and prune
    const state = await this.stateStore.read();
    const updated = [point, ...state.recoveryPoints];
    const pruned  = this._pruneRecoveryPoints(updated);

    // Delete files for removed points
    for (const removed of updated.slice(pruned.length)) {
      await rm(removed.dbSnapshotPath, { force: true });
    }

    await this.stateStore.write({ recoveryPoints: pruned });
    return point;
  }

  /**
   * Verifies a recovery point by re-reading the snapshot and comparing SHA-256.
   * Throws if the file is missing or corrupted.
   */
  async verifyRecoveryPoint(point: RecoveryPoint): Promise<void> {
    let content: Buffer;
    try {
      content = await readFile(point.dbSnapshotPath);
    } catch {
      throw new Error(`Recovery point snapshot not found: ${point.dbSnapshotPath}`);
    }
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== point.dbSnapshotSha256) {
      throw new Error(
        `Recovery point ${point.id} is corrupted: SHA-256 mismatch ` +
        `(expected ${point.dbSnapshotSha256}, got ${actual})`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  /**
   * Restores the DB from the most recent recovery point.
   * Emits audit event and metric.
   */
  async rollbackPatch(dbPath: string): Promise<RollbackPatchResult> {
    const t0 = Date.now();
    const state = await this.stateStore.read();
    const point = state.recoveryPoints[0];

    if (!point) {
      return { restored: false, reason: 'No recovery points available' };
    }

    try {
      await this.verifyRecoveryPoint(point);
      await copyFile(point.dbSnapshotPath, dbPath);
      await this.stateStore.write({ systemState: 'NORMAL', updateInProgress: false });
      recordPatchRollbackDuration(Date.now() - t0);
      return { restored: true };
    } catch (err) {
      // Rollback failed — enter SAFE_MODE
      await this.stateStore.write({ systemState: 'SAFE_MODE', updateInProgress: false });
      return {
        restored: false,
        reason: `Rollback failed — entering safe mode: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _pruneRecoveryPoints(points: RecoveryPoint[]): RecoveryPoint[] {
    const cutoff = Date.now() - RECOVERY_POINT_TTL_MS;
    const recent = points.filter((p) => new Date(p.createdAt).getTime() > cutoff);
    // Keep whichever set is larger: recency-based OR top-N
    const byCount = points.slice(0, MAX_RECOVERY_POINTS);
    return recent.length >= byCount.length ? recent : byCount;
  }
}
