import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CalendarRepository } from './calendar.js';

// Minimal slices of the real schema needed to union calendar events.
const SCHEMA = `
CREATE TABLE court_hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, case_number TEXT,
  hearing_date TEXT NOT NULL, hearing_time TEXT, courtroom TEXT,
  judge_name TEXT, hearing_type TEXT, raw_summary TEXT
);
CREATE TABLE Cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_number TEXT, status TEXT, statute_deadline TEXT
);
CREATE TABLE Tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT, due_date TEXT, case_id INTEGER
);
`;

describe('CalendarRepository.eventsInRange (§4.1.1)', () => {
  let db: DatabaseConnection;
  let repo: CalendarRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare(`INSERT INTO Cases (id, case_number, status, statute_deadline)
                VALUES (1, 'תא-2024-042', 'open', '2026-05-20')`).run();
    db.prepare(`INSERT INTO Cases (id, case_number, status, statute_deadline)
                VALUES (2, 'תפ-2023-005', 'closed', '2026-05-21')`).run(); // closed → excluded
    db.prepare(`INSERT INTO court_hearings (id, case_id, case_number, hearing_date, hearing_time, hearing_type, judge_name)
                VALUES (10, 1, 'תא-2024-042', '2026-05-15T00:00:00Z', '09:30', 'מחוזי', 'כהן')`).run();
    db.prepare(`INSERT INTO Tasks (id, title, status, due_date, case_id)
                VALUES (20, 'הגשת כתב הגנה', 'pending', '2026-05-18', 1)`).run();
    db.prepare(`INSERT INTO Tasks (id, title, status, due_date, case_id)
                VALUES (21, 'משימה שהושלמה', 'checked', '2026-05-19', 1)`).run(); // checked → excluded
    repo = new CalendarRepository(db);
  });

  afterEach(() => db.close());

  it('unions hearings, open-case statute deadlines, and active task due-dates', () => {
    const events = repo.eventsInRange('2026-05-01', '2026-05-31');
    const ids = events.map((e) => e.id);
    expect(ids).toContain('hearing:10');
    expect(ids).toContain('statute:1');
    expect(ids).toContain('task:20');
  });

  it('excludes closed cases and non-active tasks', () => {
    const ids = repo.eventsInRange('2026-05-01', '2026-05-31').map((e) => e.id);
    expect(ids).not.toContain('statute:2'); // closed case
    expect(ids).not.toContain('task:21');   // checked task
  });

  it('respects the date range (date-only comparison, ignoring time component)', () => {
    const onlyHearingDay = repo.eventsInRange('2026-05-15', '2026-05-15');
    expect(onlyHearingDay.map((e) => e.id)).toEqual(['hearing:10']);
  });

  it('returns events sorted by date then time', () => {
    const events = repo.eventsInRange('2026-05-01', '2026-05-31');
    const dates = events.map((e) => e.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('normalizes link + metadata fields', () => {
    const hearing = repo.eventsInRange('2026-05-15', '2026-05-15')[0]!;
    expect(hearing.kind).toBe('hearing');
    expect(hearing.time).toBe('09:30');
    expect(hearing.judge).toBe('כהן');
    expect(hearing.linkType).toBe('case');
    expect(hearing.linkId).toBe('1');
  });

  describe('deadlinesAtRisk (§4.4.3)', () => {
    it('includes overdue open-case statute deadlines (no lower bound)', () => {
      // today far after the 2026-05-20 statute deadline → overdue
      const risks = repo.deadlinesAtRisk('2026-06-01', 90);
      const statute = risks.find((r) => r.id === 'statute:1');
      expect(statute).toBeDefined();
      expect(statute!.daysUntil).toBeLessThan(0);
      expect(statute!.risk).toBe('overdue');
    });

    it('classifies risk bands by daysUntil', () => {
      const risks = repo.deadlinesAtRisk('2026-05-16', 90); // hearing 05-15 overdue, statute 05-20 in 4d
      const byId = new Map(risks.map((r) => [r.id, r]));
      expect(byId.get('statute:1')!.risk).toBe('soon');     // 4 days → soon
      expect(byId.get('task:20')!.risk).toBe('critical');   // 05-18, 2 days → critical
    });

    it('excludes closed cases and past hearings beyond today', () => {
      const ids = repo.deadlinesAtRisk('2026-05-16', 90).map((r) => r.id);
      expect(ids).not.toContain('statute:2'); // closed
      expect(ids).not.toContain('hearing:10'); // hearing 05-15 is before today 05-16
    });

    it('respects the horizon upper bound', () => {
      const ids = repo.deadlinesAtRisk('2026-05-01', 5).map((r) => r.id); // window 05-01..05-06
      expect(ids).not.toContain('statute:1'); // 05-20 beyond horizon
    });
  });

  describe('caseTimeline (M3)', () => {
    beforeEach(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS Documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, case_id INTEGER, document_date TEXT
      )`);
      db.prepare("INSERT INTO Documents (id, filename, case_id, document_date) VALUES (100, 'חוזה.pdf', 1, '2026-05-10')").run();
      db.prepare("INSERT INTO Documents (id, filename, case_id, document_date) VALUES (101, 'ללא תאריך.pdf', 1, NULL)").run();
    });

    it('unions hearings, statute, tasks, and dated documents for the case, sorted by date', () => {
      const tl = repo.caseTimeline(1);
      const ids = tl.map((e) => e.id);
      expect(ids).toContain('hearing:10');   // 2026-05-15
      expect(ids).toContain('statute:1');    // 2026-05-20
      expect(ids).toContain('task:20');      // 2026-05-18
      expect(ids).toContain('document:100'); // 2026-05-10
      expect(ids).not.toContain('document:101'); // no document_date → excluded
      const dates = tl.map((e) => e.date);
      expect(dates).toEqual([...dates].sort());
      expect(tl[0]!.id).toBe('document:100'); // earliest
    });

    it('links documents to the reader and other events to the case', () => {
      const tl = repo.caseTimeline(1);
      expect(tl.find((e) => e.id === 'document:100')!.linkType).toBe('document');
      expect(tl.find((e) => e.id === 'hearing:10')!.linkType).toBe('case');
    });
  });
});
