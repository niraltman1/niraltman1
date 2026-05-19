import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { WorkerSupervisor } from '../../packages/pipeline/src/supervisor.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
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

describe('WorkerSupervisor', () => {
  let db: Database.Database;
  let sup: WorkerSupervisor;

  beforeEach(() => {
    db  = createTestDb();
    sup = new WorkerSupervisor(db, { heartbeatIntervalMs: 100_000 }); // disable auto-heartbeat
  });

  afterEach(async () => {
    await sup.gracefulShutdown(100);
    db.close();
  });

  it('spawn() registers a worker and persists it', () => {
    const id = sup.spawn('ocr');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const row = db.prepare('SELECT status, worker_type FROM WorkerHealth WHERE worker_id = ?').get(id) as
      { status: string; worker_type: string } | undefined;
    expect(row?.worker_type).toBe('ocr');
    expect(row?.status).toBe('idle');
  });

  it('run() marks worker busy during task execution', async () => {
    const id = sup.spawn('classify');
    let statusDuringTask = '';

    await sup.run(id, 'test-task', async () => {
      const row = db.prepare('SELECT status FROM WorkerHealth WHERE worker_id = ?').get(id) as
        { status: string } | undefined;
      statusDuringTask = row?.status ?? '';
    });

    expect(statusDuringTask).toBe('busy');
  });

  it('run() returns to idle after task completes', async () => {
    const id = sup.spawn('classify');
    await sup.run(id, 'test-task', async () => 42);

    const row = db.prepare('SELECT status, tasks_completed FROM WorkerHealth WHERE worker_id = ?').get(id) as
      { status: string; tasks_completed: number } | undefined;
    expect(row?.status).toBe('idle');
    expect(row?.tasks_completed).toBe(1);
  });

  it('run() increments tasks_failed on error', async () => {
    const id = sup.spawn('enrich');
    await expect(sup.run(id, 'fail-task', async () => {
      throw new Error('enrichment failed');
    })).rejects.toThrow('enrichment failed');

    const row = db.prepare('SELECT tasks_failed FROM WorkerHealth WHERE worker_id = ?').get(id) as
      { tasks_failed: number } | undefined;
    expect(row?.tasks_failed).toBe(1);
  });

  it('health() returns snapshot of all workers', () => {
    sup.spawn('ocr');
    sup.spawn('classify');
    const health = sup.health();
    expect(health.length).toBe(2);
    expect(health.every((w) => w.status === 'idle')).toBe(true);
  });

  it('terminate() marks worker as dead when idle', () => {
    const id = sup.spawn('ocr');
    sup.terminate(id);
    const health = sup.health();
    expect(health.find((w) => w.workerId === id)).toBeUndefined();
  });

  it('enforces concurrency limit — rejects second run when maxConcurrency=1', async () => {
    const id = sup.spawn('ocr', 1);
    let secondStarted = false;

    // Start a long task in background
    const longTask = sup.run(id, 'long', async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Immediately try to run another — should throw
    try {
      await sup.run(id, 'second', async () => { secondStarted = true; });
    } catch {
      // expected
    }

    await longTask;
    expect(secondStarted).toBe(false);
  });

  it('gracefulShutdown resolves when no tasks are running', async () => {
    sup.spawn('ocr');
    sup.spawn('enrich');
    await expect(sup.gracefulShutdown(1_000)).resolves.toBeUndefined();
    expect(sup.health().length).toBe(0);
  });

  it('emits worker:spawned event on spawn', () => {
    const events: string[] = [];
    sup.on('worker:spawned', ({ workerId }: { workerId: string }) => events.push(workerId));
    const id = sup.spawn('ocr');
    expect(events).toContain(id);
  });

  it('emits worker:task-complete event', async () => {
    let completed = false;
    sup.on('worker:task-complete', () => { completed = true; });
    const id = sup.spawn('classify');
    await sup.run(id, 'task', async () => {});
    expect(completed).toBe(true);
  });
});
