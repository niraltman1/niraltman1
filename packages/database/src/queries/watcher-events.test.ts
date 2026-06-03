import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { WatcherEventsRepository } from './watcher-events.js';

const SCHEMA = `
CREATE TABLE WatcherEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL DEFAULT 'added',
  file_path TEXT NOT NULL,
  file_hash TEXT,
  debounce_key TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  queued INTEGER NOT NULL DEFAULT 0,
  duplicate INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);
`;

describe('WatcherEventsRepository (file ingestion)', () => {
  let db: DatabaseConnection;
  let repo: WatcherEventsRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new WatcherEventsRepository(db);
  });

  afterEach(() => db.close());

  it('enqueues a file as an unprocessed event', () => {
    const e = repo.enqueue('/inbox/a.pdf');
    expect(e.id).toBeGreaterThan(0);
    expect(e.filePath).toBe('/inbox/a.pdf');
    expect(e.processed).toBe(false);
    expect(repo.listUnprocessed()).toHaveLength(1);
  });

  it('lists unprocessed oldest-first and excludes processed rows', () => {
    const a = repo.enqueue('/inbox/a.pdf');
    repo.enqueue('/inbox/b.pdf');
    repo.markProcessed(a.id, { queued: true });
    const pending = repo.listUnprocessed();
    expect(pending.map((r) => r.filePath)).toEqual(['/inbox/b.pdf']);
  });

  it('markProcessed records queued / duplicate / error and timestamps', () => {
    const a = repo.enqueue('/inbox/a.pdf');
    repo.markProcessed(a.id, { queued: true });
    const got = repo.get(a.id)!;
    expect(got.processed).toBe(true);
    expect(got.queued).toBe(true);
    expect(got.duplicate).toBe(false);
    expect(got.processedAt).toBeTruthy();

    const b = repo.enqueue('/inbox/b.pdf');
    repo.markProcessed(b.id, { duplicate: true });
    expect(repo.get(b.id)!.duplicate).toBe(true);

    const c = repo.enqueue('/inbox/c.pdf');
    repo.markProcessed(c.id, { error: 'נתיב הוחרג' });
    expect(repo.get(c.id)!.errorMessage).toBe('נתיב הוחרג');
    expect(repo.get(c.id)!.processed).toBe(true);
  });

  it('recordRetryableError keeps the row unprocessed for retry', () => {
    const a = repo.enqueue('/inbox/a.pdf');
    repo.recordRetryableError(a.id, 'OCR timeout');
    const got = repo.get(a.id)!;
    expect(got.processed).toBe(false);
    expect(got.errorMessage).toBe('OCR timeout');
    expect(repo.listUnprocessed()).toHaveLength(1); // still pending
  });

  it('stats reflects unprocessed / processed / errors and last processed time', () => {
    const a = repo.enqueue('/inbox/a.pdf');
    const b = repo.enqueue('/inbox/b.pdf');
    repo.enqueue('/inbox/c.pdf');
    repo.markProcessed(a.id, { queued: true });
    repo.recordRetryableError(b.id, 'locked');

    const s = repo.stats();
    expect(s.processed).toBe(1);
    expect(s.unprocessed).toBe(2);   // b (errored) + c
    expect(s.errors).toBe(1);        // b has an error but is unprocessed
    expect(s.lastProcessedAt).toBeTruthy();
  });
});
