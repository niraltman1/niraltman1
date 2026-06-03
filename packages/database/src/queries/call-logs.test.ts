import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CallLogsRepository } from './call-logs.js';

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY);
CREATE TABLE Cases (id INTEGER PRIMARY KEY);
CREATE TABLE system_users (id INTEGER PRIMARY KEY);
CREATE TABLE CallLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, case_id INTEGER,
  is_evidence INTEGER NOT NULL DEFAULT 0, direction TEXT NOT NULL DEFAULT 'inbound',
  subject TEXT, summary TEXT, occurred_at TEXT NOT NULL, duration_minutes INTEGER,
  participants TEXT, tags TEXT, created_by INTEGER,
  created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
`;

describe('CallLogsRepository (C6)', () => {
  let db: DatabaseConnection;
  let repo: CallLogsRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare('INSERT INTO Clients (id) VALUES (1)').run();
    db.prepare('INSERT INTO Cases (id) VALUES (5)').run();
    repo = new CallLogsRepository(db);
  });

  afterEach(() => db.close());

  it('creates a call log with defaults and JSON arrays round-tripped', () => {
    const c = repo.create({
      clientId: 1, direction: 'outbound', subject: 'עדכון לקוח',
      summary: 'שוחחנו על המשך הטיפול', durationMinutes: 12,
      participants: ['הלקוח', 'עו"ד כהן'], tags: ['עדכון', 'דחוף'], createdBy: 7,
    });
    expect(c.id).toBeGreaterThan(0);
    expect(c.clientId).toBe(1);
    expect(c.caseId).toBeNull();
    expect(c.isEvidence).toBe(false);
    expect(c.direction).toBe('outbound');
    expect(c.durationMinutes).toBe(12);
    expect(c.participants).toEqual(['הלקוח', 'עו"ד כהן']);
    expect(c.tags).toEqual(['עדכון', 'דחוף']);
    expect(c.occurredAt).toBeTruthy(); // defaulted to now
  });

  it('lists by client and by case', () => {
    repo.create({ clientId: 1, subject: 'א' });
    repo.create({ clientId: 1, caseId: 5, subject: 'ב' });
    expect(repo.listByClient(1)).toHaveLength(2);
    expect(repo.listByCase(5)).toHaveLength(1);
    expect(repo.listByCase(5)[0]!.subject).toBe('ב');
  });

  it('updates editable fields', () => {
    const c = repo.create({ clientId: 1, subject: 'old' });
    const u = repo.update(c.id, { subject: 'new', durationMinutes: 30, tags: ['פשרה'] });
    expect(u!.subject).toBe('new');
    expect(u!.durationMinutes).toBe(30);
    expect(u!.tags).toEqual(['פשרה']);
  });

  it('saveAsEvidence binds the case and flips is_evidence', () => {
    const c = repo.create({ clientId: 1, subject: 'שיחה' });
    expect(c.caseId).toBeNull();
    const promoted = repo.saveAsEvidence(c.id, 5);
    expect(promoted!.caseId).toBe(5);
    expect(promoted!.isEvidence).toBe(true);
    expect(repo.listByCase(5).map((x) => x.id)).toContain(c.id);
  });
});
