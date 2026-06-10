import { logger } from '@factum-il/shared';
import type { UpdateStateStore } from './UpdateStateStore.js';
import { restoreFromRollback, type RollbackResult } from './UpdateRollback.js';

const AGENT = 'PostUpdateHealthCheck';

const REQUIRED_TABLES = [
  'system_users',
  'Documents',
  'Cases',
  'Clients',
] as const;

interface MinimalDb {
  prepare(sql: string): { get(...args: unknown[]): unknown };
}

export interface PostUpdateHealthResult {
  wasApplied:        boolean;  // false → no pending update, health check skipped
  healthy:           boolean;
  failures:          string[];
  rollbackTriggered: boolean;
  rollbackResult?:   RollbackResult;
}

function checkDatabaseHealth(db: MinimalDb): string[] {
  const failures: string[] = [];

  try {
    const row = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string } | undefined;
    if (!row || row.integrity_check !== 'ok') {
      failures.push(`PRAGMA integrity_check returned: ${String(row?.integrity_check ?? 'nothing')}`);
    }
  } catch (e) {
    failures.push(`integrity_check threw: ${String(e)}`);
  }

  for (const table of REQUIRED_TABLES) {
    try {
      const exists = db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`,
      ).get(table);
      if (!exists) failures.push(`Required table missing: ${table}`);
    } catch (e) {
      failures.push(`Table check for ${table} threw: ${String(e)}`);
    }
  }

  return failures;
}

/**
 * Runs once at API startup to verify a just-applied update didn't corrupt the database.
 * If health checks fail, automatically restores the pre-update snapshot and relaunches
 * the previous installer (per CT2 post-update self-healing requirement).
 *
 * Returns immediately (wasApplied: false) when no update was in progress, so normal
 * cold-starts have zero overhead.
 */
export async function runPostUpdateHealthCheck(
  stateStore: UpdateStateStore,
  db: MinimalDb,
  dbPath: string,
): Promise<PostUpdateHealthResult> {
  const state = await stateStore.read();

  if (!state.updateInProgress) {
    return { wasApplied: false, healthy: true, failures: [], rollbackTriggered: false };
  }

  logger.info('[startup] Post-update health check running…', { category: 'startup', agentSource: AGENT });

  const failures = checkDatabaseHealth(db);
  const healthy  = failures.length === 0;

  if (healthy) {
    await stateStore.write({ updateInProgress: false });
    logger.info('[startup] Post-update health check passed — update confirmed healthy', {
      category: 'startup', agentSource: AGENT,
    });
    return { wasApplied: true, healthy: true, failures: [], rollbackTriggered: false };
  }

  logger.error('[startup] Post-update health check FAILED — triggering automatic rollback', {
    category: 'startup', agentSource: AGENT, failures,
  });

  let rollbackResult: RollbackResult;
  try {
    rollbackResult = await restoreFromRollback(state.rollback ?? null, dbPath);
  } catch (e) {
    rollbackResult = { restored: false, reason: String(e), installerLaunched: false };
  }

  return {
    wasApplied:        true,
    healthy:           false,
    failures,
    rollbackTriggered: true,
    rollbackResult,
  };
}
