import type { DatabaseConnection } from '../connection.js';

/**
 * Calendar & Docketing (§4.1.1). Unions the firm's date-bearing records into one
 * normalized event stream: court hearings, case statute deadlines, and task due-dates.
 * Read-only; the underlying tables own the data. All dates are ISO (YYYY-MM-DD[...]).
 */

export type CalendarEventKind = 'hearing' | 'statute_deadline' | 'task';

export type DeadlineRiskLevel = 'overdue' | 'critical' | 'soon' | 'upcoming';

export interface CalendarEvent {
  readonly id:         string;  // stable composite id, e.g. "hearing:12"
  readonly kind:       CalendarEventKind;
  readonly date:       string;  // YYYY-MM-DD
  readonly time:       string | null;
  readonly title:      string;
  readonly caseId:     number | null;
  readonly caseNumber: string | null;
  readonly courtName:  string | null;
  readonly judge:      string | null;
  readonly linkType:   'case' | 'route';
  readonly linkId:     string;
}

export interface DeadlineRisk extends CalendarEvent {
  readonly daysUntil: number;          // negative = overdue
  readonly risk:      DeadlineRiskLevel;
}

function dayOf(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function addDays(ymdStr: string, days: number): string {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function classifyRisk(daysUntil: number): DeadlineRiskLevel {
  if (daysUntil < 0)  return 'overdue';
  if (daysUntil <= 3) return 'critical';
  if (daysUntil <= 14) return 'soon';
  return 'upcoming';
}

export class CalendarRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Returns every calendar event whose date falls within [from, to] (inclusive,
   * date-only comparison). Sorted by date then time.
   */
  eventsInRange(from: string, to: string): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    const hearings = this.db.prepare(`
      SELECT id, case_id, case_number, hearing_date, hearing_time,
             courtroom, judge_name, hearing_type, raw_summary
        FROM court_hearings
       WHERE date(hearing_date) BETWEEN ? AND ?
    `).all(from, to) as Record<string, unknown>[];
    for (const r of hearings) {
      const caseId = (r['case_id'] as number | null) ?? null;
      events.push({
        id:         `hearing:${r['id'] as number}`,
        kind:       'hearing',
        date:       dayOf(r['hearing_date'] as string),
        time:       (r['hearing_time'] as string | null) ?? null,
        title:      (r['hearing_type'] as string | null)
                      ?? (r['raw_summary'] as string | null)
                      ?? 'דיון',
        caseId,
        caseNumber: (r['case_number'] as string | null) ?? null,
        courtName:  (r['courtroom']   as string | null) ?? null,
        judge:      (r['judge_name']  as string | null) ?? null,
        linkType:   caseId != null ? 'case' : 'route',
        linkId:     caseId != null ? String(caseId) : '/cases',
      });
    }

    const cases = this.db.prepare(`
      SELECT id, case_number, statute_deadline
        FROM Cases
       WHERE status = 'open'
         AND statute_deadline IS NOT NULL
         AND date(statute_deadline) BETWEEN ? AND ?
    `).all(from, to) as Record<string, unknown>[];
    for (const r of cases) {
      events.push({
        id:         `statute:${r['id'] as number}`,
        kind:       'statute_deadline',
        date:       dayOf(r['statute_deadline'] as string),
        time:       null,
        title:      `התיישנות — תיק ${r['case_number'] as string}`,
        caseId:     r['id'] as number,
        caseNumber: (r['case_number'] as string | null) ?? null,
        courtName:  null,
        judge:      null,
        linkType:   'case',
        linkId:     String(r['id'] as number),
      });
    }

    const tasks = this.db.prepare(`
      SELECT t.id, t.title, t.due_date, t.case_id, c.case_number
        FROM Tasks t
        LEFT JOIN Cases c ON c.id = t.case_id
       WHERE t.status IN ('pending','in_progress')
         AND t.due_date IS NOT NULL
         AND date(t.due_date) BETWEEN ? AND ?
    `).all(from, to) as Record<string, unknown>[];
    for (const r of tasks) {
      const caseId = (r['case_id'] as number | null) ?? null;
      events.push({
        id:         `task:${r['id'] as number}`,
        kind:       'task',
        date:       dayOf(r['due_date'] as string),
        time:       null,
        title:      (r['title'] as string | null) ?? 'משימה',
        caseId,
        caseNumber: (r['case_number'] as string | null) ?? null,
        courtName:  null,
        judge:      null,
        linkType:   caseId != null ? 'case' : 'route',
        linkId:     caseId != null ? String(caseId) : '/tasks',
      });
    }

    events.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time ?? '').localeCompare(b.time ?? '');
    });
    return events;
  }

  /**
   * Liability radar (§4.4.3): everything due within `horizonDays` of `today`, plus
   * any already-overdue open statute deadlines and tasks (no lower bound on those).
   * Annotated with daysUntil + a risk band, sorted soonest/most-overdue first.
   */
  deadlinesAtRisk(today: string, horizonDays = 90): DeadlineRisk[] {
    const cutoff = addDays(today, horizonDays);
    const out: DeadlineRisk[] = [];

    // Open-case statute deadlines — include overdue (no lower bound).
    const cases = this.db.prepare(`
      SELECT id, case_number, statute_deadline
        FROM Cases
       WHERE status = 'open'
         AND statute_deadline IS NOT NULL
         AND date(statute_deadline) <= ?
    `).all(cutoff) as Record<string, unknown>[];
    for (const r of cases) {
      const date = dayOf(r['statute_deadline'] as string);
      out.push({
        id: `statute:${r['id'] as number}`, kind: 'statute_deadline', date, time: null,
        title: `התיישנות — תיק ${r['case_number'] as string}`,
        caseId: r['id'] as number, caseNumber: (r['case_number'] as string | null) ?? null,
        courtName: null, judge: null, linkType: 'case', linkId: String(r['id'] as number),
        daysUntil: daysBetween(today, date), risk: classifyRisk(daysBetween(today, date)),
      });
    }

    // Active tasks — include overdue (no lower bound).
    const tasks = this.db.prepare(`
      SELECT t.id, t.title, t.due_date, t.case_id, c.case_number
        FROM Tasks t
        LEFT JOIN Cases c ON c.id = t.case_id
       WHERE t.status IN ('pending','in_progress')
         AND t.due_date IS NOT NULL
         AND date(t.due_date) <= ?
    `).all(cutoff) as Record<string, unknown>[];
    for (const r of tasks) {
      const date = dayOf(r['due_date'] as string);
      const caseId = (r['case_id'] as number | null) ?? null;
      out.push({
        id: `task:${r['id'] as number}`, kind: 'task', date, time: null,
        title: (r['title'] as string | null) ?? 'משימה',
        caseId, caseNumber: (r['case_number'] as string | null) ?? null,
        courtName: null, judge: null,
        linkType: caseId != null ? 'case' : 'route', linkId: caseId != null ? String(caseId) : '/tasks',
        daysUntil: daysBetween(today, date), risk: classifyRisk(daysBetween(today, date)),
      });
    }

    // Future hearings within the horizon (past hearings already happened).
    const hearings = this.db.prepare(`
      SELECT id, case_id, case_number, hearing_date, hearing_time, courtroom, judge_name, hearing_type, raw_summary
        FROM court_hearings
       WHERE date(hearing_date) BETWEEN ? AND ?
    `).all(today, cutoff) as Record<string, unknown>[];
    for (const r of hearings) {
      const date = dayOf(r['hearing_date'] as string);
      const caseId = (r['case_id'] as number | null) ?? null;
      out.push({
        id: `hearing:${r['id'] as number}`, kind: 'hearing', date,
        time: (r['hearing_time'] as string | null) ?? null,
        title: (r['hearing_type'] as string | null) ?? (r['raw_summary'] as string | null) ?? 'דיון',
        caseId, caseNumber: (r['case_number'] as string | null) ?? null,
        courtName: (r['courtroom'] as string | null) ?? null,
        judge: (r['judge_name'] as string | null) ?? null,
        linkType: caseId != null ? 'case' : 'route', linkId: caseId != null ? String(caseId) : '/cases',
        daysUntil: daysBetween(today, date), risk: classifyRisk(daysBetween(today, date)),
      });
    }

    out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time ?? '').localeCompare(b.time ?? '')));
    return out;
  }
}
