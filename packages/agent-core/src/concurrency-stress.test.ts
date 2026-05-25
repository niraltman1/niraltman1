import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { canRunAgent, markAgentCompleted, markAgentFailed } from './execution-guard.js';

// Minimal DDL needed — mirrors migration 049 AgentRunRegistry table
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS Cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT
  );
  CREATE TABLE IF NOT EXISTS AgentRunRegistry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type  TEXT NOT NULL,
    case_id     INTEGER REFERENCES Cases(id) ON DELETE CASCADE,
    document_id INTEGER,
    status      TEXT NOT NULL DEFAULT 'running',
    trace_id    TEXT NOT NULL UNIQUE,
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    finished_at TEXT,
    UNIQUE(agent_type, case_id, status)
  );
`;

function makeDb() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(SCHEMA);
  // Seed a case
  raw.exec(`INSERT INTO Cases DEFAULT VALUES`);
  return raw as unknown as Parameters<typeof canRunAgent>[2];
}

describe('Concurrency Stress — same case', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
  });

  it('exactly one of N simultaneous canRunAgent calls returns allowed:true', () => {
    const N = 20;
    const results = Array.from({ length: N }, () =>
      canRunAgent('case-summarizer', 1, db),
    );
    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(1);
    expect(blocked).toHaveLength(N - 1);
  });

  it('all blocked calls still return a unique traceId string', () => {
    const results = Array.from({ length: 5 }, () =>
      canRunAgent('case-summarizer', 1, db),
    );
    const ids = results.map((r) => r.traceId);
    expect(new Set(ids).size).toBe(5);
  });

  it('lock is released after markAgentCompleted — next call succeeds', () => {
    const first = canRunAgent('case-summarizer', 1, db);
    expect(first.allowed).toBe(true);

    // Still blocked while first run is active
    const second = canRunAgent('case-summarizer', 1, db);
    expect(second.allowed).toBe(false);

    markAgentCompleted(first.traceId, db);

    // Now released
    const third = canRunAgent('case-summarizer', 1, db);
    expect(third.allowed).toBe(true);
  });

  it('lock is released after markAgentFailed', () => {
    const first = canRunAgent('timeline-builder', 1, db);
    expect(first.allowed).toBe(true);

    markAgentFailed(first.traceId, 'simulated crash', db);

    const retry = canRunAgent('timeline-builder', 1, db);
    expect(retry.allowed).toBe(true);
  });
});

describe('Concurrency Stress — different cases', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    // Seed two more cases (id=2, id=3)
    (db as unknown as Database.Database).exec(`INSERT INTO Cases DEFAULT VALUES; INSERT INTO Cases DEFAULT VALUES;`);
  });

  it('concurrent locks on different cases all succeed', () => {
    const r1 = canRunAgent('case-summarizer', 1, db);
    const r2 = canRunAgent('case-summarizer', 2, db);
    const r3 = canRunAgent('case-summarizer', 3, db);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('same agent type on different cases does not interfere', () => {
    const a = canRunAgent('timeline-builder', 1, db);
    const b = canRunAgent('timeline-builder', 2, db);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);

    // Completing case 1 does not affect case 2 lock
    markAgentCompleted(a.traceId, db);
    const c = canRunAgent('timeline-builder', 2, db);
    expect(c.allowed).toBe(false); // case 2 lock still held by b
  });
});

describe('Concurrency Stress — performance', () => {
  it('20 sequential lock attempts complete in under 200ms total', () => {
    const db = makeDb();
    const start = Date.now();
    Array.from({ length: 20 }, () => canRunAgent('research-agent', 1, db));
    expect(Date.now() - start).toBeLessThan(200);
  });
});
