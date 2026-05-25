import { describe, it, expect } from 'vitest';
import {
  computeCaseStateHash,
  checkExecutionValidity,
  type CaseExecutionContext,
} from './case-execution-context.js';

// Minimal in-memory DbHandle for testing
function makeDb(caseRow: { status: string; updated_at: string; doc_count: number } | undefined) {
  return {
    prepare: (_sql: string) => ({
      get: (_caseId: unknown) => caseRow,
    }),
  };
}

describe('computeCaseStateHash', () => {
  it('returns a 16-char hex string for an existing case', () => {
    const db = makeDb({ status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 3 });
    const hash = computeCaseStateHash(1, db);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns "not-found" when the case does not exist', () => {
    const db = makeDb(undefined);
    expect(computeCaseStateHash(99, db)).toBe('not-found');
  });

  it('produces different hashes for different mutable states', () => {
    const dbA = makeDb({ status: 'open',   updated_at: '2026-01-01T00:00:00Z', doc_count: 1 });
    const dbB = makeDb({ status: 'closed', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 });
    expect(computeCaseStateHash(1, dbA)).not.toBe(computeCaseStateHash(1, dbB));
  });

  it('produces identical hashes for identical state', () => {
    const row = { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 2 };
    const db1 = makeDb(row);
    const db2 = makeDb(row);
    expect(computeCaseStateHash(1, db1)).toBe(computeCaseStateHash(1, db2));
  });
});

describe('checkExecutionValidity', () => {
  function makeCtx(hash: string): CaseExecutionContext {
    return { caseId: 1, userId: 'u1', requestedAt: '2026-01-01T00:00:00Z', caseStateHash: hash };
  }

  it('returns valid:true when hash matches current state', () => {
    const db = makeDb({ status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 });
    const hash = computeCaseStateHash(1, db);
    const ctx  = makeCtx(hash);
    const result = checkExecutionValidity(ctx, db);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns valid:false with reason when hash diverges (case was modified)', () => {
    const db  = makeDb({ status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 1 });
    const ctx = makeCtx('stale0000deadbeef'); // wrong hash
    const result = checkExecutionValidity(ctx, db);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/modified after this request/i);
  });

  it('returns valid:false when case no longer exists', () => {
    const db  = makeDb(undefined);
    const ctx = makeCtx('any-hash-here');
    const result = checkExecutionValidity(ctx, db);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/no longer exists/i);
  });

  it('NEVER throws — returns optimistic valid:true on DB errors', () => {
    const brokenDb = {
      prepare: () => ({
        get: () => { throw new Error('DB error'); },
      }),
    };
    const ctx = makeCtx('any-hash');
    expect(() => checkExecutionValidity(ctx, brokenDb)).not.toThrow();
    const result = checkExecutionValidity(ctx, brokenDb);
    expect(result.valid).toBe(true); // optimistic
  });
});
