import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { TaskRepository } from './tasks.js';

const SCHEMA = `
CREATE TABLE Tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  priority    TEXT NOT NULL DEFAULT 'normal',
  due_date    TEXT,
  client_id   INTEGER,
  case_id     INTEGER,
  document_id INTEGER,
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE Clients (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he TEXT NOT NULL,
  id_type TEXT NOT NULL DEFAULT 'personal'
);
`;

describe('TaskRepository.list() — overdue filter', () => {
  let db: DatabaseConnection;
  let repo: TaskRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new TaskRepository(db);

    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const tomorrow  = new Date(Date.now() + 86_400_000).toISOString();

    db.prepare(`INSERT INTO Tasks (title, status, due_date) VALUES (?, ?, ?)`).run('overdue pending',     'pending',    yesterday);
    db.prepare(`INSERT INTO Tasks (title, status, due_date) VALUES (?, ?, ?)`).run('overdue in_progress', 'in_progress', yesterday);
    db.prepare(`INSERT INTO Tasks (title, status, due_date) VALUES (?, ?, ?)`).run('future pending',      'pending',    tomorrow);
    db.prepare(`INSERT INTO Tasks (title, status, due_date) VALUES (?, ?, ?)`).run('overdue checked',     'checked',    yesterday);
    db.prepare(`INSERT INTO Tasks (title, status, due_date) VALUES (?, ?, ?)`).run('no due date',         'pending',    null);
  });

  afterEach(() => db.close());

  it('returns only tasks where due_date is past and status is active', () => {
    const { items, total } = repo.list({ overdue: true });
    expect(total).toBe(2);
    const titles = items.map((t) => t.title);
    expect(titles).toContain('overdue pending');
    expect(titles).toContain('overdue in_progress');
  });

  it('excludes completed (checked) tasks even if past due', () => {
    const { items } = repo.list({ overdue: true });
    expect(items.every((t) => t.status !== 'checked')).toBe(true);
  });

  it('excludes future tasks', () => {
    const { items } = repo.list({ overdue: true });
    expect(items.every((t) => t.title !== 'future pending')).toBe(true);
  });

  it('excludes tasks with no due_date', () => {
    const { items } = repo.list({ overdue: true });
    expect(items.every((t) => t.title !== 'no due date')).toBe(true);
  });

  it('standard status filter still works when overdue is not set', () => {
    const { items, total } = repo.list({ status: 'pending' });
    expect(total).toBe(3);
    expect(items.every((t) => t.status === 'pending')).toBe(true);
  });
});
