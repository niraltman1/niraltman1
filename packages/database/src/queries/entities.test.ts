import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { EntitiesRepository } from './entities.js';

const SCHEMA = `
CREATE TABLE court_hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, case_number TEXT,
  hearing_date TEXT, hearing_type TEXT, judge_name TEXT
);
CREATE TABLE Documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, document_date TEXT, filename TEXT
);
CREATE TABLE DocumentInsights (
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER, judge_name TEXT, court_name TEXT
);
`;

describe('EntitiesRepository (M6)', () => {
  let db: DatabaseConnection;
  let repo: EntitiesRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO court_hearings (id, case_id, case_number, hearing_date, hearing_type, judge_name) VALUES (10, 1, 'תא-1', '2026-01-01', 'דיון', 'כהן')").run();
    db.prepare("INSERT INTO court_hearings (id, case_id, hearing_date, judge_name) VALUES (11, 2, '2026-02-01', '   ')").run(); // blank → excluded
    db.prepare("INSERT INTO Documents (id, case_id, document_date, filename) VALUES (20, 1, '2026-01-02', 'כתב.pdf')").run();
    db.prepare("INSERT INTO DocumentInsights (id, document_id, judge_name, court_name) VALUES (1, 20, 'כהן', 'מחוזי ת\"א')").run();
    db.prepare("INSERT INTO DocumentInsights (id, document_id, judge_name, court_name) VALUES (2, 20, NULL, NULL)").run(); // null → excluded
    repo = new EntitiesRepository(db);
  });

  afterEach(() => db.close());

  it('collects judge references from hearings and documents, excluding blanks', () => {
    const refs = repo.judgeReferences();
    expect(refs).toHaveLength(2); // hearing 10 + document 20 (blank hearing + null insight excluded)
    expect(refs.filter((r) => r.kind === 'hearing')).toHaveLength(1);
    expect(refs.filter((r) => r.kind === 'document')).toHaveLength(1);
    const hearing = refs.find((r) => r.kind === 'hearing')!;
    expect(hearing.name).toBe('כהן');
    expect(hearing.caseId).toBe(1);
    expect(hearing.refId).toBe(10);
  });

  it('collects court references from document insights', () => {
    const courts = repo.courtReferences();
    expect(courts).toHaveLength(1);
    expect(courts[0]!.name).toBe('מחוזי ת"א');
    expect(courts[0]!.refId).toBe(20); // the document id
    expect(courts[0]!.kind).toBe('document');
  });
});
