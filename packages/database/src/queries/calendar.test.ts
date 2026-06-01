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
});
