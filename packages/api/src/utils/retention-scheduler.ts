import type { Repos } from '../db.js';
import { waitForIdle } from './idle-throttle.js';
import { logAuditEvent } from '../middleware/audit-logger.js';
import { withWriteLock } from './write-mutex.js';
import { emitActivity } from './activity-emitter.js';
import { logger } from '@factum-il/shared';

const INTERVAL_MS = Number(process.env['RETENTION_INTERVAL_MS'] ?? 86_400_000); // 24h

let timer: ReturnType<typeof setInterval> | null = null;

async function runRetentionSweep(repos: Repos): Promise<void> {
  await waitForIdle();

  await withWriteLock('retention-scheduler:sweep', async () => {
    const policies = repos.db.prepare(
      'SELECT resource_type, ttl_days, action, legal_hold FROM retention_policies WHERE legal_hold = 0',
    ).all() as Array<{ resource_type: string; ttl_days: number; action: string; legal_hold: number }>;

    let totalPurged = 0;

    for (const policy of policies) {
      try {
        const purged = applyRetentionPolicy(repos, policy);
        totalPurged += purged;
      } catch (err) {
        logger.error(`Retention error for ${policy.resource_type}: ${err instanceof Error ? err.message : String(err)}`, { category: 'system' });
      }
    }

    if (totalPurged > 0) {
      logAuditEvent(repos.db, {
        eventType:    'delete',
        resourceType: 'retention_sweep',
        actionDetail: { totalPurged, runAt: new Date().toISOString() },
        severity:     'info',
      });
      emitActivity(repos, {
        kind:    'sync_completed',
        source:  'scheduler:retention',
        message: `Retention sweep — ${totalPurged} records processed`,
        details: { totalPurged },
      });
      logger.info(`Retention sweep complete — ${totalPurged} records processed`, { category: 'system' });
    }
  });
}

function applyRetentionPolicy(
  repos: Repos,
  policy: { resource_type: string; ttl_days: number; action: string },
): number {
  const cutoff = `datetime('now', '-${policy.ttl_days} days')`;

  if (policy.resource_type === 'ocr_text') {
    const result = repos.db.prepare(`
      UPDATE Documents SET ocr_text = NULL
      WHERE ocr_text IS NOT NULL
        AND created_at < ${cutoff}
        AND sensitivity NOT IN ('privileged', 'highly_sensitive')
    `).run();
    return result.changes;
  }

  if (policy.resource_type === 'temp_files') {
    // Purge stale DocumentInsights (ephemeral AI-extracted data)
    const result = repos.db.prepare(`
      DELETE FROM DocumentInsights
      WHERE created_at < ${cutoff}
    `).run();
    return result.changes;
  }

  if (policy.resource_type === 'audit_events') {
    // Archive = delete old info-level events; keep warn/critical forever
    const result = repos.db.prepare(`
      DELETE FROM audit_events
      WHERE severity = 'info'
        AND logged_at < ${cutoff}
    `).run();
    return result.changes;
  }

  return 0;
}

export function startRetentionScheduler(repos: Repos): void {
  if (timer) return;
  timer = setInterval(() => {
    runRetentionSweep(repos).catch((err) =>
      logger.error(`Retention sweep failed: ${err instanceof Error ? err.message : String(err)}`, { category: 'system' }),
    );
  }, INTERVAL_MS);
  logger.info(`Retention scheduler started — interval: ${INTERVAL_MS}ms`, { category: 'system' });
}

export function stopRetentionScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
