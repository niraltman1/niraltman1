import { describe, it, expect, vi } from 'vitest';
import { createCaseDomain, AuthorizationError } from './case-isolation-domain.js';

// ─── Mock facades (injected, not constructed here) ────────────────────────────

const mockRetriever = { search: vi.fn().mockResolvedValue([]) };
const mockMemory    = {
  append:   vi.fn(),
  load:     vi.fn().mockReturnValue([]),
  prune:    vi.fn(),
  assemble: vi.fn().mockReturnValue({ caseMemory: [], preferences: {}, summary: '' }),
};
const mockSession   = { set: vi.fn(), get: vi.fn(), clearCase: vi.fn() };

// ─── DB helpers ───────────────────────────────────────────────────────────────

interface FakeUser { active: boolean; exists: boolean }
interface FakeCase { exists: boolean }

function makeDb(user: FakeUser, caseData: FakeCase, prepareSpy?: ReturnType<typeof vi.fn>) {
  const baseGet = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('system_users')) return user.exists && user.active ? { id: 1 } : undefined;
    if (sql.includes('Cases WHERE id')) return caseData.exists ? { id: 1 } : undefined;
    // computeCaseStateHash query
    return { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 0 };
  });

  return {
    prepare: (sql: string) => {
      prepareSpy?.(sql);
      return { run: vi.fn(), all: vi.fn().mockReturnValue([]), get: () => baseGet(sql) };
    },
  };
}

// ─── Authorization error scenarios ───────────────────────────────────────────

describe('RBAC — invalid / unknown userId', () => {
  it('throws AuthorizationError for a user not in system_users', () => {
    const db = makeDb({ active: false, exists: false }, { exists: true });
    expect(() => createCaseDomain(1, 'ghost-user', db, mockRetriever, mockMemory, mockSession))
      .toThrow(AuthorizationError);
  });

  it('AuthorizationError.name is "AuthorizationError"', () => {
    const db = makeDb({ active: false, exists: false }, { exists: true });
    try {
      createCaseDomain(1, 'ghost', db, mockRetriever, mockMemory, mockSession);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).name).toBe('AuthorizationError');
    }
  });
});

describe('RBAC — inactive user', () => {
  it('throws AuthorizationError when user is_active=0', () => {
    const db = makeDb({ active: false, exists: true }, { exists: true });
    expect(() => createCaseDomain(1, 'inactive-attorney', db, mockRetriever, mockMemory, mockSession))
      .toThrow(AuthorizationError);
  });
});

describe('RBAC — missing case', () => {
  it('throws AuthorizationError when caseId does not exist', () => {
    const db = makeDb({ active: true, exists: true }, { exists: false });
    expect(() => createCaseDomain(999, 'admin', db, mockRetriever, mockMemory, mockSession))
      .toThrow(AuthorizationError);
  });
});

describe('RBAC — authorized access', () => {
  it('returns a domain when user is active and case exists', () => {
    const db = makeDb({ active: true, exists: true }, { exists: true });
    const domain = createCaseDomain(1, 'admin', db, mockRetriever, mockMemory, mockSession);
    expect(domain.context.caseId).toBe(1);
    expect(domain.context.userId).toBe('admin');
  });

  it('exposes injected facades on the domain', () => {
    const db = makeDb({ active: true, exists: true }, { exists: true });
    const domain = createCaseDomain(1, 'attorney1', db, mockRetriever, mockMemory, mockSession);
    expect(domain.retriever).toBe(mockRetriever);
    expect(domain.memory).toBe(mockMemory);
    expect(domain.session).toBe(mockSession);
  });
});

describe('RBAC — user check precedes case query', () => {
  it('user validation fires before case lookup (authz-first order)', () => {
    const callLog: string[] = [];
    const db = {
      prepare: (sql: string) => {
        callLog.push(sql.includes('system_users') ? 'user' : 'other');
        return {
          run: vi.fn(),
          all: vi.fn().mockReturnValue([]),
          get: vi.fn().mockReturnValue(undefined), // both checks fail
        };
      },
    };

    try {
      createCaseDomain(1, 'nobody', db, mockRetriever, mockMemory, mockSession);
    } catch { /* expected */ }

    // First prepare call must be user lookup
    expect(callLog[0]).toBe('user');
  });
});

describe('RBAC — domain.checkValidity never throws', () => {
  it('returns a ValidityResult without throwing', () => {
    const db = makeDb({ active: true, exists: true }, { exists: true });
    const domain = createCaseDomain(1, 'attorney1', db, mockRetriever, mockMemory, mockSession);
    expect(() => domain.checkValidity(db)).not.toThrow();
    expect(typeof domain.checkValidity(db).valid).toBe('boolean');
  });
});
