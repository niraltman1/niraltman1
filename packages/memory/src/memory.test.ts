import { describe, it, expect, beforeEach } from 'vitest';
// @ts-expect-error -- resolved via vitest alias to ../database/node_modules/better-sqlite3
import Database from 'better-sqlite3';
import { appendMemory, loadMemory, pruneOldMemory } from './case-memory.js';
import { guardMemoryWrite } from './memory-guard.js';
import type { CaseMemoryKind } from './types.js';

type RawDb = {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): void; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
};

function createTestDb(): RawDb {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const db = new (Database as new (path: string) => RawDb)(':memory:');
  db.exec(`
    CREATE TABLE CaseMemory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id    INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      content    TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      agent_name TEXT NOT NULL,
      trace_id   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  return db;
}

function makeEntry(kind: CaseMemoryKind, confidence = 1.0, caseId = 1) {
  return { caseId, kind, content: `content-${kind}`, confidence, agentName: 'test', traceId: `tr-${Math.random()}` };
}

describe('appendMemory + loadMemory', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('appends and loads by kind', () => {
    appendMemory(makeEntry('entity'), db);
    appendMemory(makeEntry('risk'), db);
    const results = loadMemory(1, ['entity'], db);
    expect(results).toHaveLength(1);
    expect(results[0]!.kind).toBe('entity');
  });

  it('returns empty array for empty kinds list', () => {
    appendMemory(makeEntry('entity'), db);
    expect(loadMemory(1, [], db)).toHaveLength(0);
  });

  it('returns empty array for unknown caseId', () => {
    appendMemory(makeEntry('entity', 1.0, 1), db);
    expect(loadMemory(99, ['entity'], db)).toHaveLength(0);
  });

  it('loads multiple kinds in one query', () => {
    appendMemory(makeEntry('entity'), db);
    appendMemory(makeEntry('summary'), db);
    appendMemory(makeEntry('risk'), db);
    const results = loadMemory(1, ['entity', 'summary'], db);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.kind).sort()).toEqual(['entity', 'summary'].sort());
  });

  it('limits results to 50', () => {
    for (let i = 0; i < 60; i++) appendMemory(makeEntry('reasoning'), db);
    const results = loadMemory(1, ['reasoning'], db);
    expect(results.length).toBeLessThanOrEqual(50);
  });
});

describe('pruneOldMemory', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('keeps only the most recent N entries', () => {
    for (let i = 0; i < 30; i++) appendMemory(makeEntry('summary'), db);
    pruneOldMemory(1, 10, db);
    const count = (db.prepare('SELECT COUNT(*) as c FROM CaseMemory WHERE case_id=1').get() as { c: number }).c;
    expect(count).toBe(10);
  });

  it('does not affect entries for other caseIds', () => {
    for (let i = 0; i < 5; i++) appendMemory(makeEntry('entity', 1.0, 2), db);
    for (let i = 0; i < 20; i++) appendMemory(makeEntry('entity', 1.0, 1), db);
    pruneOldMemory(1, 5, db);
    const case2Count = (db.prepare('SELECT COUNT(*) as c FROM CaseMemory WHERE case_id=2').get() as { c: number }).c;
    expect(case2Count).toBe(5);
  });
});

describe('guardMemoryWrite', () => {
  it('allows entity (FACT) at any confidence', () => {
    expect(guardMemoryWrite(makeEntry('entity', 0.0))).toBe(true);
    expect(guardMemoryWrite(makeEntry('entity', 1.0))).toBe(true);
  });

  it('allows summary (AI_SUMMARY) above default threshold 0.7', () => {
    expect(guardMemoryWrite(makeEntry('summary', 0.8))).toBe(true);
  });

  it('denies summary (AI_SUMMARY) below threshold', () => {
    expect(guardMemoryWrite(makeEntry('summary', 0.4))).toBe(false);
  });

  it('always denies risk (AI_HYPOTHESIS)', () => {
    expect(guardMemoryWrite(makeEntry('risk', 0.99))).toBe(false);
  });

  it('always denies timeline (AI_HYPOTHESIS)', () => {
    expect(guardMemoryWrite(makeEntry('timeline', 0.99))).toBe(false);
  });

  it('respects custom threshold', () => {
    expect(guardMemoryWrite(makeEntry('summary', 0.5), 0.4)).toBe(true);
    expect(guardMemoryWrite(makeEntry('summary', 0.3), 0.4)).toBe(false);
  });
});
