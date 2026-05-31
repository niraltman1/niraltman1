import type { Repos } from '../db.js';
import { waitForIdle } from './idle-throttle.js';
import { notificationService } from './notification-service.js';
import { logger } from '@factum-il/shared';

const INTERVAL_MS = Number(process.env['NUDGE_INTERVAL_MS'] ?? 24 * 60 * 60 * 1000);

interface NudgeCase {
  case_id:       number;
  case_number:   string;
  filing_id:     number;
  created_at:    string;
  whatsapp_phone: string | null;
}

interface GapItem {
  section:  string;
  label_he: string;
}

async function runNudgeCycle(repos: Repos): Promise<void> {
  await waitForIdle();

  const cases = repos.db.prepare(`
    SELECT c.id AS case_id, c.case_number, f.id AS filing_id, f.created_at,
           cl.whatsapp_phone
    FROM insolvency_filings f
    JOIN Cases c   ON c.id = f.case_id
    JOIN Clients cl ON cl.id = c.client_id
    WHERE f.phase = 'Pre_Filing'
      AND cl.whatsapp_phone IS NOT NULL
      AND CAST(julianday('now') - julianday(f.created_at) AS INTEGER) <= 30
  `).all() as NudgeCase[];

  for (const row of cases) {
    const gaps = repos.db.prepare(`
      SELECT section, label_he
      FROM insolvency_checklist_items
      WHERE filing_id = ? AND status != 'complete'
      ORDER BY section, id
    `).all(row.filing_id) as GapItem[];

    if (gaps.length === 0) continue;

    const grouped = gaps.reduce<Record<string, string[]>>((acc, g) => {
      (acc[g.section] ??= []).push(g.label_he);
      return acc;
    }, {});

    const lines: string[] = [
      `שלום, תזכורת לתיק ${row.case_number} — פרטים חסרים לטופס 5:`,
    ];
    for (const [section, labels] of Object.entries(grouped)) {
      lines.push(`\nסעיף ${section}:`);
      for (const l of labels) lines.push(`  • ${l}`);
    }
    lines.push('\nאנא השלם/י את הפרטים ושלח/י לפרקליטות.');

    await notificationService.send(row.whatsapp_phone!, lines.join('\n'));
    logger.info(`Nudge sent for case ${row.case_number} (${gaps.length} missing fields)`, { category: 'system' });

    // Surface the same gap alert in the in-app inbox (§4.1.3). One row per filing;
    // dedup_key keeps daily cycles idempotent.
    repos.notifications.upsert({
      kind:     'form5_gap',
      severity: 'warning',
      titleHe:  `טופס 5 חסר ${gaps.length} שדות — תיק ${row.case_number}`,
      bodyHe:   gaps.map((g) => g.label_he).join(' · '),
      linkType: 'case',
      linkId:   String(row.case_id),
      dedupKey: `form5_gap:filing:${row.filing_id}`,
    });
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startInsolvencyNudgeScheduler(repos: Repos): void {
  if (_timer) return;
  logger.info(`Nudge scheduler started — interval=${INTERVAL_MS / 3_600_000}h`, { category: 'system' });
  void runNudgeCycle(repos);
  _timer = setInterval(() => void runNudgeCycle(repos), INTERVAL_MS);
  _timer.unref();
}

export function stopInsolvencyNudgeScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('Nudge scheduler stopped', { category: 'system' });
  }
}
