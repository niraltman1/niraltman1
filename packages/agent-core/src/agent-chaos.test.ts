import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { canRunAgent, markAgentCompleted, markAgentFailed } from './execution-guard.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS Cases (id INTEGER PRIMARY KEY AUTOINCREMENT);
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

function makeDb(): Database.Database {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(SCHEMA);
  raw.exec(`INSERT INTO Cases DEFAULT VALUES`);
  return raw;
}

// ─── Chaos A: agent failure during execution ───────────────────────────────────

describe('Chaos A — agent failure during execution', () => {
  it('AgentRunRegistry row transitions to "failed" when execution throws', () => {
    const raw = makeDb();
    const db  = raw as unknown as Parameters<typeof canRunAgent>[2];

    const { allowed, traceId } = canRunAgent('case-summarizer', 1, db);
    expect(allowed).toBe(true);

    try {
      throw new Error('simulated Ollama crash');
    } catch (err) {
      markAgentFailed(traceId, String(err), db);
    }

    const row = raw.prepare(
      `SELECT status, finished_at FROM AgentRunRegistry WHERE trace_id = ?`,
    ).get(traceId) as { status: string; finished_at: string | null } | undefined;

    expect(row?.status).toBe('failed');
    expect(row?.finished_at).not.toBeNull();
  });

  it('lock is released after failure — next run is permitted', () => {
    const raw = makeDb();
    const db  = raw as unknown as Parameters<typeof canRunAgent>[2];

    const { traceId } = canRunAgent('timeline-builder', 1, db);
    markAgentFailed(traceId, 'crash', db);

    const retry = canRunAgent('timeline-builder', 1, db);
    expect(retry.allowed).toBe(true);
  });

  it('DB integrity is intact after failed agent run', () => {
    const raw = makeDb();
    const db  = raw as unknown as Parameters<typeof canRunAgent>[2];

    const { traceId } = canRunAgent('research-agent', 1, db);
    markAgentFailed(traceId, 'chaos', db);

    const integrity = raw.pragma('integrity_check', { simple: true }) as string;
    expect(integrity).toBe('ok');
  });

  it('no "running" rows remain in AgentRunRegistry after a completed run', () => {
    const raw = makeDb();
    const db  = raw as unknown as Parameters<typeof canRunAgent>[2];

    const { traceId } = canRunAgent('discovery-agent', 1, db);
    markAgentCompleted(traceId, db);

    const row = raw.prepare(
      `SELECT count(*) as n FROM AgentRunRegistry WHERE status='running'`,
    ).get() as { n: number };
    expect(row.n).toBe(0);
  });

  it('concurrent failures on different cases leave no stale running rows', () => {
    const raw = makeDb();
    raw.exec(`INSERT INTO Cases DEFAULT VALUES; INSERT INTO Cases DEFAULT VALUES;`);
    const db = raw as unknown as Parameters<typeof canRunAgent>[2];

    const r1 = canRunAgent('case-summarizer', 1, db);
    const r2 = canRunAgent('case-summarizer', 2, db);
    const r3 = canRunAgent('case-summarizer', 3, db);

    markAgentFailed(r1.traceId, 'fail1', db);
    markAgentFailed(r2.traceId, 'fail2', db);
    markAgentFailed(r3.traceId, 'fail3', db);

    const row = raw.prepare(
      `SELECT count(*) as n FROM AgentRunRegistry WHERE status='running'`,
    ).get() as { n: number };
    expect(row.n).toBe(0);
    expect(raw.pragma('integrity_check', { simple: true })).toBe('ok');
  });
});
