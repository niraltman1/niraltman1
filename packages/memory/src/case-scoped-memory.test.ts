import { describe, it, expect, vi } from 'vitest';
import { createCaseScopedMemory, CaseScopedSessionStore } from './case-scoped-memory.js';
import { SessionStore } from './session-store.js';

// ─── createCaseScopedMemory ───────────────────────────────────────────────────

function makeDb() {
  return {
    prepare: (_sql: string) => ({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
    }),
  };
}

describe('createCaseScopedMemory', () => {
  it('load() returns an array', () => {
    const mem = createCaseScopedMemory(1, makeDb());
    expect(Array.isArray(mem.load(['summary']))).toBe(true);
  });

  it('append() does not throw', () => {
    const mem = createCaseScopedMemory(1, makeDb());
    expect(() =>
      mem.append({
        kind: 'summary',
        content: 'test',
        confidence: 0.9,
        agentName: 'test-agent',
        traceId: 'trace-1',
      }),
    ).not.toThrow();
  });

  it('prune() does not throw', () => {
    const mem = createCaseScopedMemory(1, makeDb());
    expect(() => mem.prune(10)).not.toThrow();
  });
});

// ─── CaseScopedSessionStore ───────────────────────────────────────────────────

describe('CaseScopedSessionStore', () => {
  it('set/get round-trips a value', () => {
    const store  = new SessionStore();
    const scoped = new CaseScopedSessionStore(1, store);
    scoped.set('key', 'value');
    expect(scoped.get('key')).toBe('value');
  });

  it('get() returns undefined for a key set under a different caseId', () => {
    const store   = new SessionStore();
    const scoped1 = new CaseScopedSessionStore(1, store);
    const scoped2 = new CaseScopedSessionStore(2, store);
    scoped1.set('key', 'belongs-to-case-1');
    expect(scoped2.get('key')).toBeUndefined();
  });

  it('get() returns correct value for the same caseId', () => {
    const store   = new SessionStore();
    const scoped1 = new CaseScopedSessionStore(1, store);
    const scoped2 = new CaseScopedSessionStore(2, store);
    scoped1.set('foo', 'alpha');
    scoped2.set('foo', 'beta');
    expect(scoped1.get('foo')).toBe('alpha');
    expect(scoped2.get('foo')).toBe('beta');
  });

  it('clearCase() removes only keys for the bound caseId', () => {
    const store   = new SessionStore();
    const scoped1 = new CaseScopedSessionStore(1, store);
    const scoped2 = new CaseScopedSessionStore(2, store);
    scoped1.set('x', 'v1');
    scoped2.set('x', 'v2');

    scoped1.clearCase();

    expect(scoped1.get('x')).toBeUndefined();
    expect(scoped2.get('x')).toBe('v2'); // unaffected
  });
});
