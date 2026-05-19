import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, tmpdir } from 'node:path';
import Database from 'better-sqlite3';
import { PersistentQueue } from '../../packages/pipeline/src/persistent-queue.js';
import { LockService } from '../../packages/pipeline/src/lock-service.js';

function createAndMigrateDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ProcessingQueue (
      item_id         TEXT PRIMARY KEY,
      file_hash       TEXT NOT NULL,
      original_path   TEXT NOT NULL,
      priority        INTEGER NOT NULL DEFAULT 5,
      current_state   TEXT NOT NULL DEFAULT 'DISCOVERED',
      retry_count     INTEGER NOT NULL DEFAULT 0,
      max_retries     INTEGER NOT NULL DEFAULT 3,
      next_retry_at   TEXT NOT NULL DEFAULT (datetime('now')),
      worker_id       TEXT,
      lock_expires_at TEXT,
      is_poisoned     INTEGER NOT NULL DEFAULT 0,
      manifest_ref    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS Locks (
      resource_key TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('Queue durability — simulated crash and recovery', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'legal-os-queue-int-'));
    dbPath = join(tmpDir, 'test.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('items survive across db reopens', () => {
    {
      const db = createAndMigrateDb(dbPath);
      const q = new PersistentQueue(db);
      q.enqueue('hashA', '/files/a.pdf');
      q.enqueue('hashB', '/files/b.pdf');
      db.close();
    }

    const db2 = createAndMigrateDb(dbPath);
    const q2 = new PersistentQueue(db2);
    expect(q2.depth()).toBe(2);
    db2.close();
  });

  it('locked item from crashed worker is recoverable', () => {
    const db = createAndMigrateDb(dbPath);
    db.exec(`
      INSERT INTO ProcessingQueue (item_id, file_hash, original_path, worker_id, lock_expires_at)
      VALUES ('crashed-id', 'hashX', '/files/crashed.pdf', 'dead-worker',
              datetime('now', '-10 minutes'))
    `);
    db.close();

    const db2 = createAndMigrateDb(dbPath);
    const q = new PersistentQueue(db2);
    q.recover();

    const item = q.dequeue();
    expect(item).not.toBeNull();
    expect(item!.fileHash).toBe('hashX');
    db2.close();
  });

  it('poison queue is never returned by dequeue', () => {
    const db = createAndMigrateDb(dbPath);
    db.exec(`
      INSERT INTO ProcessingQueue (item_id, file_hash, original_path, is_poisoned)
      VALUES ('poison-id', 'hashP', '/files/poison.pdf', 1)
    `);
    const q = new PersistentQueue(db);
    const item = q.dequeue();
    expect(item).toBeNull();
    db.close();
  });

  it('two concurrent workers do not claim the same item', () => {
    const db = createAndMigrateDb(dbPath);
    const q1 = new PersistentQueue(db);
    const q2 = new PersistentQueue(db);

    q1.enqueue('hashC', '/files/c.pdf');

    const item1 = q1.dequeue();
    const item2 = q2.dequeue();

    expect(item1).not.toBeNull();
    expect(item2).toBeNull();
    db.close();
  });

  it('handles 500 enqueues without duplicates', () => {
    const db = createAndMigrateDb(dbPath);
    const q = new PersistentQueue(db);

    for (let i = 0; i < 500; i++) {
      q.enqueue(`hash${i}`, `/files/doc${i}.pdf`);
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM ProcessingQueue').get() as { c: number }).c;
    expect(count).toBe(500);
    db.close();
  });
});

describe('LockService durability', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'legal-os-lock-int-'));
    dbPath = join(tmpDir, 'locks.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('expired locks from previous session are cleaned up on next acquire', () => {
    {
      const db = createAndMigrateDb(dbPath);
      db.exec(`
        INSERT INTO Locks (resource_key, owner_id, expires_at)
        VALUES ('doc:1', 'old-process', datetime('now', '-1 hour'))
      `);
      db.close();
    }

    const db2 = createAndMigrateDb(dbPath);
    const svc = new LockService(db2);
    const acquired = svc.acquire('doc:1', 30_000);
    expect(acquired).toBe(true);
    db2.close();
  });

  it('10 concurrent lock attempts on same resource — exactly 1 succeeds', () => {
    const db = createAndMigrateDb(dbPath);
    const services = Array.from({ length: 10 }, () => new LockService(db));
    const results = services.map((s) => s.acquire('doc:contested', 30_000));
    const successes = results.filter(Boolean).length;
    expect(successes).toBe(1);
    db.close();
  });
});
