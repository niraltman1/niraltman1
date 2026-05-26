/**
 * UpdateStateStore — reads and writes the local update state file.
 *
 * State file location: {dataPath}/update-state.json
 *
 * The store uses a simple read-modify-write pattern.  It never makes network
 * calls; all data is local.  Concurrent writes are not protected by a lock —
 * the single-process Electron model makes this safe in practice.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { UpdateState, UpdateChannel } from './types.js';

const DEFAULT_STATE: UpdateState = {
  currentVersion:  process.env['FACTUM_IL_VERSION'] ?? 'unknown',
  channel:         'stable',
  lastCheckedAt:   null,
  pendingManifest: null,
  rollback:        null,
  updateInProgress: false,
};

export class UpdateStateStore {
  private readonly statePath: string;

  constructor(private readonly dataPath: string) {
    this.statePath = join(dataPath, 'update-state.json');
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Reads the persisted update state from disk.
   * Returns the default state if the file does not exist or cannot be parsed.
   */
  async read(): Promise<UpdateState> {
    try {
      const raw    = await readFile(this.statePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<UpdateState>;
      return this._merge(parsed);
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Merges `state` into the persisted state and writes the result to disk.
   * Only the keys present in `state` are updated; other keys are preserved.
   */
  async write(state: Partial<UpdateState>): Promise<void> {
    const current = await this.read();
    const next    = this._merge({ ...current, ...state });
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(
      this.statePath,
      JSON.stringify(next, null, 2),
      'utf8',
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Merges a partial UpdateState over the defaults, ensuring all required
   * fields are always present and have the correct type.
   */
  private _merge(partial: Partial<UpdateState>): UpdateState {
    const channel: UpdateChannel =
      (partial.channel && ['beta', 'stable', 'enterprise'].includes(partial.channel))
        ? partial.channel
        : DEFAULT_STATE.channel;

    return {
      currentVersion:   typeof partial.currentVersion === 'string'
        ? partial.currentVersion
        : DEFAULT_STATE.currentVersion,
      channel,
      lastCheckedAt:    partial.lastCheckedAt ?? null,
      pendingManifest:  partial.pendingManifest ?? null,
      rollback:         partial.rollback ?? null,
      updateInProgress: typeof partial.updateInProgress === 'boolean'
        ? partial.updateInProgress
        : false,
    };
  }
}
