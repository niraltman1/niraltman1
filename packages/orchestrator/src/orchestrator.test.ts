import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error -- resolved via vitest alias to ../database/node_modules/better-sqlite3
import Database from 'better-sqlite3';
import { Orchestrator } from './orchestrator.js';
import { isEventProcessed, markEventProcessed } from './consistency-engine.js';

type RawDb = {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): { changes: number }; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
  transaction<T>(fn: () => T): T;
};

function createTestDb(): RawDb {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const db = new (Database as new (path: string) => RawDb)(':memory:');
  // Minimal schema — no FK to Documents/Cases for isolated unit tests
  db.exec(`
    CREATE TABLE WorkflowStates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      stage       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'PENDING',
      version     INTEGER NOT NULL DEFAULT 1,
      error       TEXT,
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(document_id, stage)
    );
    CREATE TABLE WorkflowIdempotencyLog (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      processed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      acquired_at     TEXT
    );
  `);
  return db;
}

describe('Orchestrator', () => {
  let db: ReturnType<typeof createTestDb>;
  let orch: Orchestrator;

  beforeEach(() => {
    db = createTestDb();
    orch = new Orchestrator();
  });

  it('transitionStage inserts a new row with version=1', () => {
    orch.transitionStage(1, 'OCR_DONE', 'PENDING', db);
    const row = db.prepare('SELECT * FROM WorkflowStates WHERE document_id=1 AND stage=?').get('OCR_DONE') as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row['version']).toBe(1);
    expect(row['status']).toBe('PENDING');
  });

  it('transitionStage updates an existing row and increments version', () => {
    orch.transitionStage(1, 'OCR_DONE', 'PENDING', db);
    orch.transitionStage(1, 'OCR_DONE', 'COMPLETED', db);
    const row = db.prepare('SELECT * FROM WorkflowStates WHERE document_id=1 AND stage=?').get('OCR_DONE') as Record<string, unknown>;
    expect(row['version']).toBe(2);
    expect(row['status']).toBe('COMPLETED');
    const count = (db.prepare('SELECT COUNT(*) as c FROM WorkflowStates').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('getState returns null for unknown stage', () => {
    expect(orch.getState(99, 'OCR_DONE', db)).toBeNull();
  });

  it('isStageCompleted returns false for PENDING and true for COMPLETED', () => {
    orch.transitionStage(1, 'OCR_DONE', 'PENDING', db);
    expect(orch.isStageCompleted(1, 'OCR_DONE', db)).toBe(false);
    orch.transitionStage(1, 'OCR_DONE', 'COMPLETED', db);
    expect(orch.isStageCompleted(1, 'OCR_DONE', db)).toBe(true);
  });

  it('canProceedToStage: first stage always allowed', () => {
    expect(orch.canProceedToStage(1, 'OCR_DONE', db)).toBe(true);
  });

  it('canProceedToStage: blocked when prior stage not COMPLETED', () => {
    orch.transitionStage(1, 'OCR_DONE', 'PENDING', db);
    expect(orch.canProceedToStage(1, 'ENTITY_EXTRACTION_DONE', db)).toBe(false);
  });

  it('canProceedToStage: allowed when all prior stages COMPLETED', () => {
    orch.transitionStage(1, 'OCR_DONE', 'COMPLETED', db);
    orch.transitionStage(1, 'ENTITY_EXTRACTION_DONE', 'COMPLETED', db);
    expect(orch.canProceedToStage(1, 'INDEXING_DONE', db)).toBe(true);
    expect(orch.canProceedToStage(1, 'MEMORY_WRITTEN', db)).toBe(false);
  });

  it('acquireLock grants lock once and denies second attempt', () => {
    expect(orch.acquireLock(5, db)).toBe(true);
    expect(orch.acquireLock(5, db)).toBe(false);
  });

  it('releaseLock allows re-acquisition after release', () => {
    orch.acquireLock(5, db);
    orch.releaseLock(5, db);
    expect(orch.acquireLock(5, db)).toBe(true);
  });
});

describe('consistency-engine', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('isEventProcessed returns false for unknown key', () => {
    expect(isEventProcessed('OCRCompleted:1:OCR_DONE', db)).toBe(false);
  });

  it('markEventProcessed then isEventProcessed returns true', () => {
    markEventProcessed('OCRCompleted:1:OCR_DONE', db);
    expect(isEventProcessed('OCRCompleted:1:OCR_DONE', db)).toBe(true);
  });

  it('markEventProcessed is idempotent (INSERT OR IGNORE)', () => {
    markEventProcessed('key:1', db);
    expect(() => markEventProcessed('key:1', db)).not.toThrow();
    expect(isEventProcessed('key:1', db)).toBe(true);
  });
});
