import { describe, it, expect } from 'vitest';
import { computeCaseStateHash, checkExecutionValidity } from './case-execution-context.js';
import type { CaseExecutionContext } from './case-execution-context.js';

// ─── Minimal controllable DB mock ────────────────────────────────────────────

interface MockCaseState {
  status:     string;
  updated_at: string;
  doc_count:  number;
}

function makeDb(state: MockCaseState | undefined) {
  return {
    prepare: (_sql: string) => ({
      get: (_id: unknown) => state,
    }),
  };
}

function captureHash(state: MockCaseState): { ctx: CaseExecutionContext; hash: string } {
  const db   = makeDb(state);
  const hash = computeCaseStateHash(1, db);
  const ctx: CaseExecutionContext = {
    caseId:        1,
    userId:        'attorney1',
    requestedAt:   new Date().toISOString(),
    caseStateHash: hash,
  };
  return { ctx, hash };
}

// ─── Non-stale baseline ───────────────────────────────────────────────────────

describe('stale-execution — baseline (no mutation)', () => {
  it('returns valid:true when case state is unchanged', () => {
    const state = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 5 };
    const { ctx } = captureHash(state);
    const db = makeDb(state);
    const result = checkExecutionValidity(ctx, db);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// ─── 4 mutation scenarios ─────────────────────────────────────────────────────

describe('stale-execution — case status changes', () => {
  it('returns isStale:true when case status changes open→closed', () => {
    const before = { status: 'open',   updated_at: '2026-01-01T00:00:00Z', doc_count: 3 };
    const after  = { status: 'closed', updated_at: '2026-01-01T00:00:00Z', doc_count: 3 };
    const { ctx } = captureHash(before);
    const result  = checkExecutionValidity(ctx, makeDb(after));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/modified after this request/i);
  });

  it('NEVER throws — always returns an object', () => {
    const before = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 };
    const after  = { status: 'archived', updated_at: '2026-02-01T00:00:00Z', doc_count: 1 };
    const { ctx } = captureHash(before);
    expect(() => checkExecutionValidity(ctx, makeDb(after))).not.toThrow();
  });
});

describe('stale-execution — document added', () => {
  it('returns isStale:true when doc_count increases', () => {
    const before = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 2 };
    const after  = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 3 };
    const { ctx } = captureHash(before);
    const result  = checkExecutionValidity(ctx, makeDb(after));
    expect(result.valid).toBe(false);
  });
});

describe('stale-execution — document removed', () => {
  it('returns isStale:true when doc_count decreases', () => {
    const before = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 5 };
    const after  = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 4 };
    const { ctx } = captureHash(before);
    const result  = checkExecutionValidity(ctx, makeDb(after));
    expect(result.valid).toBe(false);
  });
});

describe('stale-execution — metadata update', () => {
  it('returns isStale:true when updated_at advances', () => {
    const before = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 3 };
    const after  = { status: 'open', updated_at: '2026-06-01T12:00:00Z', doc_count: 3 };
    const { ctx } = captureHash(before);
    const result  = checkExecutionValidity(ctx, makeDb(after));
    expect(result.valid).toBe(false);
  });
});

// ─── Resilience ───────────────────────────────────────────────────────────────

describe('stale-execution — resilience', () => {
  it('returns valid:true (optimistic) when DB throws', () => {
    const state  = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 };
    const { ctx } = captureHash(state);
    const brokenDb = { prepare: () => ({ get: () => { throw new Error('DB gone'); } }) };
    const result   = checkExecutionValidity(ctx, brokenDb);
    expect(result.valid).toBe(true);
  });

  it('returns valid:false when case no longer exists', () => {
    const state  = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 };
    const { ctx } = captureHash(state);
    const result  = checkExecutionValidity(ctx, makeDb(undefined));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no longer exists/i);
  });
});
