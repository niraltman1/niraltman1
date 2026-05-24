import { describe, it, expect, vi } from 'vitest';
import { createCaseDomain, AuthorizationError } from './case-isolation-domain.js';

// Minimal mock facades
const mockRetriever = { search: vi.fn().mockResolvedValue([]) };
const mockMemory = {
  append: vi.fn(),
  load: vi.fn().mockReturnValue([]),
  prune: vi.fn(),
  assemble: vi.fn().mockReturnValue({ caseMemory: [], preferences: {}, summary: '' }),
};
const mockSession = { set: vi.fn(), get: vi.fn(), clearCase: vi.fn() };

function makeDb(
  userActive: boolean,
  caseExists: boolean,
  caseState?: { status: string; updated_at: string; doc_count: number },
) {
  return {
    prepare: (sql: string) => ({
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockImplementation(() => {
        if (sql.includes('system_users')) {
          return userActive ? { id: 1 } : undefined;
        }
        if (sql.includes('Cases WHERE id')) {
          return caseExists ? { id: 1 } : undefined;
        }
        if (sql.includes('Cases c WHERE')) {
          // computeCaseStateHash query
          return caseState ?? { status: 'open', updated_at: '2026-01-01T00:00:00Z', doc_count: 0 };
        }
        if (sql.includes('COUNT(*)') && sql.includes('Documents')) {
          return { doc_count: 0 };
        }
        return undefined;
      }),
    }),
  };
}

describe('createCaseDomain', () => {
  it('returns a domain object when user is active and case exists', () => {
    const db = makeDb(true, true);
    const domain = createCaseDomain(1, 'attorney1', db, mockRetriever, mockMemory, mockSession);
    expect(domain.context.caseId).toBe(1);
    expect(domain.context.userId).toBe('attorney1');
    expect(typeof domain.context.caseStateHash).toBe('string');
    expect(typeof domain.context.requestedAt).toBe('string');
  });

  it('throws AuthorizationError when user is not active / does not exist', () => {
    const db = makeDb(false, true);
    expect(() =>
      createCaseDomain(1, 'unknown-user', db, mockRetriever, mockMemory, mockSession),
    ).toThrow(AuthorizationError);
  });

  it('throws AuthorizationError when case does not exist', () => {
    const db = makeDb(true, false);
    expect(() =>
      createCaseDomain(999, 'attorney1', db, mockRetriever, mockMemory, mockSession),
    ).toThrow(AuthorizationError);
  });

  it('AuthorizationError has the correct name', () => {
    const db = makeDb(false, false);
    try {
      createCaseDomain(1, 'bad-user', db, mockRetriever, mockMemory, mockSession);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as Error).name).toBe('AuthorizationError');
    }
  });

  it('domain.checkValidity() returns a ValidityResult without throwing', () => {
    const db = makeDb(true, true);
    const domain = createCaseDomain(1, 'attorney1', db, mockRetriever, mockMemory, mockSession);
    const result = domain.checkValidity(db);
    expect(typeof result.valid).toBe('boolean');
  });

  it('exposes the injected retriever, memory, and session facades', () => {
    const db = makeDb(true, true);
    const domain = createCaseDomain(1, 'attorney1', db, mockRetriever, mockMemory, mockSession);
    expect(domain.retriever).toBe(mockRetriever);
    expect(domain.memory).toBe(mockMemory);
    expect(domain.session).toBe(mockSession);
  });
});
