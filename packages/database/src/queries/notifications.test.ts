import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { NotificationsRepository } from './notifications.js';

// Mirrors migrations/058_notifications.sql (kept inline so the test is self-contained).
const SCHEMA = `
CREATE TABLE Notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL,
  severity    TEXT    NOT NULL DEFAULT 'info',
  title_he    TEXT    NOT NULL,
  body_he     TEXT,
  link_type   TEXT,
  link_id     TEXT,
  dedup_key   TEXT    NOT NULL,
  read_at     TEXT,
  resolved_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_notif_dedup ON Notifications(dedup_key);
`;

describe('NotificationsRepository', () => {
  let db: DatabaseConnection;
  let repo: NotificationsRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new NotificationsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a notification and reports it as unread', () => {
    repo.upsert({
      kind: 'statute_deadline',
      severity: 'critical',
      titleHe: 'אזהרת התיישנות — תיק 42',
      linkType: 'case',
      linkId: '42',
      dedupKey: 'statute_deadline:case:42:2026-06-10',
    });

    const items = repo.listRecent();
    expect(items).toHaveLength(1);
    expect(items[0]!.titleHe).toBe('אזהרת התיישנות — תיק 42');
    expect(items[0]!.severity).toBe('critical');
    expect(items[0]!.readAt).toBeNull();
    expect(repo.unreadCount()).toBe(1);
  });

  it('dedups repeated upserts with the same dedup_key (idempotent cycles)', () => {
    const input = {
      kind: 'task_due' as const,
      titleHe: 'משימה — מועד אחרון בעוד 3 ימים',
      dedupKey: 'task_due:task:7:2026-06-03',
    };
    repo.upsert(input);
    repo.upsert(input);
    repo.upsert(input);

    expect(repo.listRecent()).toHaveLength(1);
    expect(repo.unreadCount()).toBe(1);
  });

  it('markRead flips a single notification and decrements unread', () => {
    repo.upsert({ kind: 'task_due', titleHe: 'A', dedupKey: 'a' });
    repo.upsert({ kind: 'task_due', titleHe: 'B', dedupKey: 'b' });
    const [first] = repo.listRecent();

    repo.markRead(first!.id);

    expect(repo.unreadCount()).toBe(1);
    const reloaded = repo.listRecent().find((n) => n.id === first!.id);
    expect(reloaded!.readAt).not.toBeNull();
  });

  it('markAllRead clears every unread row and returns the count changed', () => {
    repo.upsert({ kind: 'task_due', titleHe: 'A', dedupKey: 'a' });
    repo.upsert({ kind: 'task_due', titleHe: 'B', dedupKey: 'b' });
    repo.upsert({ kind: 'form5_gap', titleHe: 'C', dedupKey: 'c' });

    const changed = repo.markAllRead();

    expect(changed).toBe(3);
    expect(repo.unreadCount()).toBe(0);
    // A second call is a no-op (nothing left unread).
    expect(repo.markAllRead()).toBe(0);
  });

  it('defaults severity to info when omitted', () => {
    repo.upsert({ kind: 'queue_stuck', titleHe: 'פריט תקוע', dedupKey: 'q1' });
    expect(repo.listRecent()[0]!.severity).toBe('info');
  });

  it('hides resolved notifications from the inbox and the unread count', () => {
    repo.upsert({ kind: 'task_due', titleHe: 'A', dedupKey: 'task_due:task:1:x' });
    repo.upsert({ kind: 'task_due', titleHe: 'B', dedupKey: 'task_due:task:2:x' });
    const [first] = repo.listRecent();

    repo.resolve(first!.id);

    expect(repo.listRecent()).toHaveLength(1);
    expect(repo.unreadCount()).toBe(1);
  });

  it('listUnresolvedByKind returns only unresolved rows of that kind', () => {
    repo.upsert({ kind: 'task_due',  titleHe: 'A', dedupKey: 'task_due:task:1:x' });
    repo.upsert({ kind: 'statute_deadline', titleHe: 'S', dedupKey: 'statute_deadline:case:9:x' });
    const taskRows = repo.listUnresolvedByKind('task_due');
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]!.kind).toBe('task_due');

    repo.resolve(taskRows[0]!.id);
    expect(repo.listUnresolvedByKind('task_due')).toHaveLength(0);
  });
});
