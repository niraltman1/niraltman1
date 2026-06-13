import type { Repos } from '../db.js';
import { waitForIdle } from './idle-throttle.js';
import { logger } from '@factum-il/shared';

// Conversations with unhandled inbound messages older than this threshold get an alert.
const SLA_HOURS = Number(process.env['COMM_SLA_HOURS'] ?? 4);
const INTERVAL_MS = Number(process.env['SLA_RADAR_INTERVAL_MS'] ?? 60 * 60 * 1000); // 1 hour

interface StaleConversation {
  conversation_id: number;
  client_id:       number | null;
  case_id:         number | null;
  channel:         string;
  oldest_unhandled: string;
  unhandled_count:  number;
}

async function runSlaRadarCycle(repos: Repos): Promise<void> {
  await waitForIdle();

  let stale: StaleConversation[];
  try {
    stale = repos.db.prepare(`
      SELECT
        m.conversation_id,
        cv.client_id,
        cv.case_id,
        cv.channel,
        MIN(m.created_at)   AS oldest_unhandled,
        COUNT(*)            AS unhandled_count
      FROM CommMessages m
      JOIN CommConversations cv ON cv.id = m.conversation_id
      WHERE m.direction = 'inbound'
        AND m.handled = 0
        AND m.created_at < datetime('now', ? || ' hours')
      GROUP BY m.conversation_id
      ORDER BY oldest_unhandled ASC
    `).all(`-${SLA_HOURS}`) as StaleConversation[];
  } catch {
    return;
  }

  for (const row of stale) {
    const sinceH = Math.floor(
      (Date.now() - new Date(row.oldest_unhandled).getTime()) / 3_600_000,
    );

    repos.notifications.upsert({
      kind:     'unanswered_message',
      severity: sinceH >= SLA_HOURS * 2 ? 'critical' : 'warning',
      titleHe:  `הודעה ממתינה למענה — ${row.unhandled_count} הודעות (${row.channel})`,
      bodyHe:   `ממתין ${sinceH} שעות ללא מענה. פתח את ציר-הזמן לטיפול.`,
      linkType: row.case_id ? 'case' : row.client_id ? 'client' : 'route',
      linkId:   row.case_id
        ? String(row.case_id)
        : row.client_id
          ? String(row.client_id)
          : '/communications',
      dedupKey: `sla:conv:${row.conversation_id}`,
    });
  }

  // Resolve SLA alerts for conversations that are now fully handled.
  for (const n of repos.notifications.listUnresolvedByKind('unanswered_message')) {
    const convId = Number(n.dedupKey.split(':')[2]);
    if (!Number.isFinite(convId)) continue;
    let remaining: { n: number };
    try {
      remaining = repos.db.prepare(
        "SELECT COUNT(*) AS n FROM CommMessages WHERE conversation_id = ? AND direction = 'inbound' AND handled = 0",
      ).get(convId) as { n: number };
    } catch {
      continue;
    }
    if (remaining.n === 0) repos.notifications.resolve(n.id);
  }

  if (stale.length > 0) {
    logger.info(`SLA radar: ${stale.length} conversation(s) past ${SLA_HOURS}h threshold`, { category: 'system' });
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSlaRadarScheduler(repos: Repos): void {
  if (_timer) return;
  logger.info(`SLA radar scheduler started — SLA=${SLA_HOURS}h, interval=${INTERVAL_MS / 3_600_000}h`, { category: 'system' });
  void runSlaRadarCycle(repos);
  _timer = setInterval(() => void runSlaRadarCycle(repos), INTERVAL_MS);
  _timer.unref();
}

export function stopSlaRadarScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('SLA radar scheduler stopped', { category: 'system' });
  }
}
