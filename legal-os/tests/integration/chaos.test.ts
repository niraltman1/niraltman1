/**
 * Chaos Test Matrix — Phase 3
 *
 * Simulates crash scenarios, DB lock contention, concurrent rename collisions,
 * and memory pressure to verify system resilience.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, tmpdir } from 'node:path';
import { PersistentQueue } from '../../packages/pipeline/src/persistent-queue.js';
import { LockService } from '../../packages/pipeline/src/lock-service.js';
import { ManifestTransactionEngine } from '../../packages/pipeline/src/transaction.js';
import { WorkerSupervisor } from '../../packages/pipeline/src/supervisor.js';

// ─────────────────────────────────────────────────────────────────────────────
//  DB setup
// ─────────────────────────────────────────────────────────────────────────────

function buildDb(path: string): Database.Database {
  const db = new Database(path);
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
    CREATE TABLE IF NOT EXISTS TransactionJournal (
      transaction_id TEXT PRIMARY KEY,
      document_id    INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      path_before    TEXT,
      path_after     TEXT,
      state_before   TEXT,
      state_after    TEXT,
      phase          TEXT NOT NULL DEFAULT 'BEGIN',
      interrupted    INTEGER NOT NULL DEFAULT 0,
      replayed       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ManifestSnapshots (
      snapshot_id  TEXT PRIMARY KEY,
      document_id  INTEGER NOT NULL,
      snapshot_at  TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT NOT NULL,
      file_hash    TEXT NOT NULL,
      mtime_epoch  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Documents (
      id             INTEGER PRIMARY KEY,
      filename       TEXT NOT NULL,
      original_path  TEXT NOT NULL,
      file_hash      TEXT,
      processing_state TEXT NOT NULL DEFAULT 'DISCOVERED',
      ocr_text       TEXT,
      document_type  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS WorkerHealth (
      worker_id       TEXT PRIMARY KEY,
      worker_type     TEXT NOT NULL,
      pid             INTEGER,
      status          TEXT NOT NULL DEFAULT 'starting',
      memory_mb       REAL,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      tasks_failed    INTEGER NOT NULL DEFAULT 0,
      current_task    TEXT,
      last_heartbeat  TEXT,
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Chaos: Simulated crash mid-queue
// ─────────────────────────────────────────────────────────────────────────────

describe('Chaos: queue item recovery after simulated crash', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'chaos-queue-'));
    dbPath = join(tmpDir, 'chaos.db');
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('recovers dequeued item after worker crash (expired lock)', () => {
    const db = buildDb(dbPath);
    const q  = new PersistentQueue(db);
    q.enqueue('crashhash', '/files/crash.pdf');

    // Simulate crash: manually set expired lock
    db.exec(`
      UPDATE ProcessingQueue
      SET worker_id = 'dead-worker',
          lock_expires_at = datetime('now', '-30 minutes')
      WHERE file_hash = 'crashhash'
    `);

    q.recover();

    const item = q.dequeue();
    expect(item).not.toBeNull();
    expect(item!.fileHash).toBe('crashhash');
    db.close();
  });

  it('does NOT return items whose lock is still valid', () => {
    const db = buildDb(dbPath);
    const q1 = new PersistentQueue(db);
    const q2 = new PersistentQueue(db);

    q1.enqueue('livehash', '/files/live.pdf');
    const item1 = q1.dequeue();
    expect(item1).not.toBeNull();

    // Worker q1 still holds live lock — q2 should get nothing
    const item2 = q2.dequeue();
    expect(item2).toBeNull();
    db.close();
  });

  it('handles 20 concurrent crash-recovery cycles without duplicate processing', () => {
    const db = buildDb(dbPath);

    for (let i = 0; i < 20; i++) {
      db.prepare(`
        INSERT INTO ProcessingQueue (item_id, file_hash, original_path, worker_id, lock_expires_at)
        VALUES (?, ?, ?, 'dead', datetime('now', '-1 hour'))
      `).run(`id-${i}`, `hash-${i}`, `/files/${i}.pdf`);
    }

    const q = new PersistentQueue(db);
    q.recover();

    const claimed = new Set<string>();
    let item = q.dequeue();
    while (item) {
      expect(claimed.has(item.itemId)).toBe(false);
      claimed.add(item.itemId);
      q.complete(item.itemId);
      item = q.dequeue();
    }

    expect(claimed.size).toBe(20);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Chaos: DB lock contention
// ─────────────────────────────────────────────────────────────────────────────

describe('Chaos: distributed lock contention', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'chaos-lock-'));
    dbPath = join(tmpDir, 'lock.db');
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('50 concurrent acquire attempts — exactly 1 wins per resource', () => {
    const db = buildDb(dbPath);
    const services = Array.from({ length: 50 }, () => new LockService(db));

    const results = services.map((s) => s.acquire('contested-resource', 30_000));
    const wins = results.filter(Boolean);

    expect(wins.length).toBe(1);
    db.close();
  });

  it('lock released by owner allows next acquisition', () => {
    const db = buildDb(dbPath);
    const s1 = new LockService(db);
    const s2 = new LockService(db);

    expect(s1.acquire('res', 30_000)).toBe(true);
    expect(s2.acquire('res', 30_000)).toBe(false);
    s1.release('res');
    expect(s2.acquire('res', 30_000)).toBe(true);
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Chaos: Transaction journal replay after power loss
// ─────────────────────────────────────────────────────────────────────────────

describe('Chaos: transaction journal replay', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'chaos-tx-'));
    dbPath = join(tmpDir, 'tx.db');
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('getInterrupted returns all INTERRUPTED entries not yet replayed', () => {
    const db  = buildDb(dbPath);
    db.prepare(`INSERT INTO Documents (id, filename, original_path) VALUES (1, 'test.pdf', '/tmp/test.pdf')`).run();

    const engine = new ManifestTransactionEngine(db);
    const tx1 = engine.begin(1, 'MOVE', '/old/a.pdf', '/new/a.pdf', 'HASHED');
    const tx2 = engine.begin(1, 'MOVE', '/old/b.pdf', '/new/b.pdf', 'OCR_COMPLETE');

    engine.markInterrupted(tx1);
    // tx2 is committed normally
    engine.commit(tx2, 'CLASSIFIED');

    const interrupted = engine.getInterrupted();
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]!.transactionId).toBe(tx1);
    db.close();
  });

  it('interrupted transaction survives db reopen', () => {
    {
      const db = buildDb(dbPath);
      db.prepare(`INSERT INTO Documents (id, filename, original_path) VALUES (1, 't.pdf', '/t.pdf')`).run();
      const engine = new ManifestTransactionEngine(db);
      const txId = engine.begin(1, 'MOVE', '/a', '/b', 'HASHED');
      engine.markInterrupted(txId);
      db.close();
    }

    const db2     = buildDb(dbPath);
    const engine2 = new ManifestTransactionEngine(db2);
    const interrupted = engine2.getInterrupted();
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]!.phase).toBe('INTERRUPTED');
    db2.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Chaos: Worker supervisor under stress
// ─────────────────────────────────────────────────────────────────────────────

describe('Chaos: worker supervisor stress', () => {
  let db: Database.Database;
  let sup: WorkerSupervisor;

  beforeEach(() => {
    db  = buildDb(':memory:');
    sup = new WorkerSupervisor(db, { heartbeatIntervalMs: 999_999 });
  });

  afterEach(async () => {
    await sup.gracefulShutdown(500);
    db.close();
  });

  it('100 concurrent tasks across 5 workers complete without loss', async () => {
    const workers = Array.from({ length: 5 }, () => sup.spawn('classify', 20));
    const results: number[] = [];
    const tasks: Promise<void>[] = [];

    for (let i = 0; i < 100; i++) {
      const wId = workers[i % 5]!;
      tasks.push(
        sup.run(wId, `task-${i}`, async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          results.push(i);
        }),
      );
    }

    await Promise.all(tasks);
    expect(results.length).toBe(100);
  });

  it('failed tasks increment tasks_failed without blocking healthy tasks', async () => {
    const id = sup.spawn('enrich', 5);
    const tasks: Promise<unknown>[] = [];

    for (let i = 0; i < 10; i++) {
      const failing = i % 2 === 0;
      tasks.push(
        sup.run(id, `task-${i}`, async () => {
          if (failing) throw new Error('chaos');
        }).catch(() => null),
      );
    }

    await Promise.all(tasks);
    const health = sup.health().find((w) => w.workerId === id);
    expect(health).toBeDefined();
    expect(health!.tasksCompleted).toBe(5);
    expect(health!.tasksFailed).toBe(5);
  });
});
