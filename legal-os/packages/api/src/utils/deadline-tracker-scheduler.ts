import type { Repos } from '../db.js';
import { waitForIdle } from './idle-throttle.js';
import { notificationService } from './notification-service.js';
import { logger } from '@factum-il/shared';

const INTERVAL_MS    = Number(process.env['DEADLINE_TRACKER_INTERVAL_MS'] ?? 24 * 60 * 60 * 1_000);
const TASK_WARN_DAYS = 7;
const CASE_WARN_DAYS = 30;

interface TaskRow {
  id:            number;
  title:         string;
  due_date:      string;
  case_number:   string | null;
  whatsapp_phone: string | null;
}

interface CaseRow {
  id:              number;
  case_number:     string;
  statute_deadline: string;
  whatsapp_phone:  string | null;
}

async function runCycle(repos: Repos): Promise<void> {
  await waitForIdle();

  // Tasks due within TASK_WARN_DAYS
  const tasks = repos.db.prepare<[], TaskRow>(`
    SELECT t.id, t.title, t.due_date,
           c.case_number,
           cl.whatsapp_phone
      FROM Tasks t
      LEFT JOIN Cases   c  ON c.id  = t.case_id
      LEFT JOIN Clients cl ON cl.id = (
            SELECT client_id FROM Cases WHERE id = t.case_id LIMIT 1
          )
     WHERE t.status IN ('pending','in_progress')
       AND t.due_date IS NOT NULL
       AND julianday(t.due_date) - julianday('now') BETWEEN 0 AND ?
     ORDER BY t.due_date
  `).all(TASK_WARN_DAYS) as TaskRow[];

  for (const row of tasks) {
    const daysLeft = Math.round(
      (new Date(row.due_date).getTime() - Date.now()) / 86_400_000
    );
    const msg = `תזכורת: משימה "${row.title}"${row.case_number ? ` (תיק ${row.case_number})` : ''} — מועד אחרון: ${row.due_date} (${daysLeft} ימים)`;
    logger.info(`[deadline-tracker] Task ${row.id} due in ${daysLeft}d`, { category: 'system' });
    if (row.whatsapp_phone) {
      await notificationService.send(row.whatsapp_phone, msg);
    }
  }

  // Cases with statute_deadline within CASE_WARN_DAYS
  const cases = repos.db.prepare<[], CaseRow>(`
    SELECT c.id, c.case_number, c.statute_deadline,
           cl.whatsapp_phone
      FROM Cases   c
      JOIN Clients cl ON cl.id = c.client_id
     WHERE c.status = 'open'
       AND c.statute_deadline IS NOT NULL
       AND julianday(c.statute_deadline) - julianday('now') BETWEEN 0 AND ?
     ORDER BY c.statute_deadline
  `).all(CASE_WARN_DAYS) as CaseRow[];

  for (const row of cases) {
    const daysLeft = Math.round(
      (new Date(row.statute_deadline).getTime() - Date.now()) / 86_400_000
    );
    const msg = `אזהרת התיישנות: תיק ${row.case_number} — תאריך התיישנות: ${row.statute_deadline} (${daysLeft} ימים)`;
    logger.warn(`[deadline-tracker] Case ${row.case_number} statute deadline in ${daysLeft}d`, { category: 'system' });
    if (row.whatsapp_phone) {
      await notificationService.send(row.whatsapp_phone, msg);
    }
  }

  if (tasks.length + cases.length > 0) {
    logger.info(`[deadline-tracker] Cycle complete — ${tasks.length} task(s), ${cases.length} case deadline(s) alerted`, { category: 'system' });
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startDeadlineTracker(repos: Repos): void {
  if (_timer) return;
  logger.info(`[deadline-tracker] Started — interval=${INTERVAL_MS / 3_600_000}h, task_warn=${TASK_WARN_DAYS}d, case_warn=${CASE_WARN_DAYS}d`, { category: 'system' });
  void runCycle(repos);
  _timer = setInterval(() => void runCycle(repos), INTERVAL_MS);
  _timer.unref();
}

export function stopDeadlineTracker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('[deadline-tracker] Stopped', { category: 'system' });
  }
}
