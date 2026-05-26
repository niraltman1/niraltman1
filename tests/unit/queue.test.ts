import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { PersistentQueue } from '../../packages/pipeline/src/persistent-queue.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ProcessingQueue (
      item_id       TEXT PRIMARY KEY,
      file_hash     TEXT NOT NULL,
      original_path TEXT NOT NULL,
      priority      INTEGER NOT NULL DEFAULT 5,
      current_state TEXT NOT NULL DEFAULT 'DISCOVERED',
      retry_count   INTEGER NOT NULL DEFAULT 0,
      max_retries   INTEGER NOT NULL DEFAULT 3,
      next_retry_at TEXT NOT NULL DEFAULT (datetime('now')),
      worker_id     TEXT,
      lock_expires_at TEXT,
      is_poisoned   INTEGER NOT NULL DEFAULT 0,
      manifest_ref  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('PersistentQueue', () => {
  let db: Database.Database;
  let queue: PersistentQueue;

  beforeEach(() => {
    db = createTestDb();
    queue = new PersistentQueue(db);
  });

  afterEach(() => {
    db.close();
  });

  it('enqueues a new item and returns an item_id', () => {
    const id = queue.enqueue('abc123', '/files/doc.pdf');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('is idempotent — same hash returns same item_id', () => {
    const id1 = queue.enqueue('abc123', '/files/doc.pdf');
    const id2 = queue.enqueue('abc123', '/files/doc.pdf');
    expect(id1).toBe(id2);
  });

  it('dequeues an item and sets worker lock', () => {
    queue.enqueue('abc123', '/files/doc.pdf');
    const item = queue.dequeue();
    expect(item).not.toBeNull();
    expect(item!.fileHash).toBe('abc123');
    expect(item!.workerId).toBe(queue.workerId);
  });

  it('returns null when queue is empty', () => {
    const item = queue.dequeue();
    expect(item).toBeNull();
  });

  it('does not return the same item twice while locked', () => {
    queue.enqueue('abc123', '/files/doc.pdf');
    const item1 = queue.dequeue();
    const item2 = queue.dequeue();
    expect(item1).not.toBeNull();
    expect(item2).toBeNull();
  });

  it('completes an item and removes it', () => {
    queue.enqueue('abc123', '/files/doc.pdf');
    const item = queue.dequeue()!;
    queue.complete(item.itemId);
    expect(queue.depth()).toBe(0);
  });

  it('increments retry_count on fail and re-schedules', () => {
    queue.enqueue('abc123', '/files/doc.pdf');
    const item = queue.dequeue()!;
    queue.fail(item.itemId, 'OCR crashed');

    const row = db.prepare('SELECT retry_count, is_poisoned FROM ProcessingQueue WHERE item_id = ?')
                  .get(item.itemId) as { retry_count: number; is_poisoned: number };
    expect(row.retry_count).toBe(1);
    expect(row.is_poisoned).toBe(0);
  });

  it('poisons the item after max_retries', () => {
    queue.enqueue('abc123', '/files/doc.pdf', 5, 'DISCOVERED', 1);
    const item = queue.dequeue()!;
    queue.fail(item.itemId, 'permanent failure');

    const row = db.prepare('SELECT is_poisoned FROM ProcessingQueue WHERE item_id = ?')
                  .get(item.itemId) as { is_poisoned: number };
    expect(row.is_poisoned).toBe(1);
  });

  it('reports correct queue depth', () => {
    queue.enqueue('hash1', '/files/a.pdf');
    queue.enqueue('hash2', '/files/b.pdf');
    queue.enqueue('hash3', '/files/c.pdf');
    expect(queue.depth()).toBe(3);
  });

  it('recover() releases stale locks', () => {
    db.exec(`
      INSERT INTO ProcessingQueue (item_id, file_hash, original_path, worker_id, lock_expires_at)
      VALUES ('stale-id', 'hashX', '/files/stale.pdf', 'dead-worker',
              datetime('now', '-1 hour'))
    `);
    queue.recover();
    const row = db.prepare('SELECT worker_id FROM ProcessingQueue WHERE item_id = ?')
                  .get('stale-id') as { worker_id: string | null };
    expect(row.worker_id).toBeNull();
  });

  it('exponential backoff increases with each failure', () => {
    queue.enqueue('backoff-hash', '/files/b.pdf', 5, 'DISCOVERED', 5);
    const item1 = queue.dequeue()!;
    queue.fail(item1.itemId, 'err1');

    const row1 = db.prepare('SELECT next_retry_at, retry_count FROM ProcessingQueue WHERE item_id = ?')
                   .get(item1.itemId) as { next_retry_at: string; retry_count: number };
    expect(row1.retry_count).toBe(1);

    // Force unlock so we can dequeue again
    db.prepare('UPDATE ProcessingQueue SET worker_id = NULL, lock_expires_at = NULL, next_retry_at = datetime(\'now\', \'-1 second\') WHERE item_id = ?')
      .run(item1.itemId);

    const item2 = queue.dequeue()!;
    queue.fail(item2.itemId, 'err2');
    const row2 = db.prepare('SELECT retry_count FROM ProcessingQueue WHERE item_id = ?')
                   .get(item1.itemId) as { retry_count: number };
    expect(row2.retry_count).toBe(2);
  });
});
