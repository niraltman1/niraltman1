import { computeCaseStateHash, checkExecutionValidity } from './case-execution-context.js';
import type { CaseExecutionContext, ValidityResult } from './case-execution-context.js';

// Forward-declare the facade types to avoid circular imports.
// The actual implementations are injected by the caller (API layer).
export interface CaseScopedRetriever {
  search(query: string, opts?: { limit?: number }): Promise<unknown[]>;
}
export interface CaseScopedMemoryHandle {
  append(entry: Record<string, unknown>): void;
  load(kinds: string[]): unknown[];
  prune(keepLatest: number): void;
  assemble(userId: string): unknown;
}
export interface CaseScopedSessionStoreHandle {
  set<T>(key: string, value: T): void;
  get<T>(key: string): T | undefined;
  clearCase(): void;
}

export interface CaseIsolationDomain {
  context:   CaseExecutionContext;
  retriever: CaseScopedRetriever;
  memory:    CaseScopedMemoryHandle;
  session:   CaseScopedSessionStoreHandle;
  checkValidity(db: DbHandle): ValidityResult;
}

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Verifies that userId is an active user in system_users and that caseId exists.
 * RBAC v1: any active authenticated user may access any case in the firm.
 * The hook point for per-attorney restrictions is clear; add a CaseAssignments
 * JOIN here when that table is introduced.
 */
function checkUserCaseAccess(userId: string, caseId: number, db: DbHandle): void {
  // Verify the user exists and is active
  const userRow = db.prepare(
    `SELECT id FROM system_users WHERE username = ? AND is_active = 1`,
  ).get(userId) as { id: number } | undefined;

  if (!userRow) {
    throw new AuthorizationError(
      `User "${userId}" is not an active system user — access denied`,
    );
  }

  // Verify the case exists
  const caseRow = db.prepare(
    `SELECT id FROM Cases WHERE id = ?`,
  ).get(caseId) as { id: number } | undefined;

  if (!caseRow) {
    throw new AuthorizationError(
      `Case ${caseId} does not exist — access denied`,
    );
  }
}

/**
 * Creates a fully isolated domain for a single case + user combination.
 *
 * Throws AuthorizationError if:
 *  - userId is not an active system user, OR
 *  - caseId does not exist in the database
 *
 * The retriever, memory, and session facades are injected rather than
 * constructed here to avoid circular package dependencies.  The API layer
 * creates them from @factum-il/retrieval and @factum-il/memory.
 */
export function createCaseDomain(
  caseId:   number,
  userId:   string,
  db:       DbHandle,
  retriever: CaseScopedRetriever,
  memory:    CaseScopedMemoryHandle,
  session:   CaseScopedSessionStoreHandle,
): CaseIsolationDomain {
  // Hard authorization check — throws on failure
  checkUserCaseAccess(userId, caseId, db);

  const context: CaseExecutionContext = {
    caseId,
    userId,
    requestedAt:   new Date().toISOString(),
    caseStateHash: computeCaseStateHash(caseId, db),
  };

  return {
    context,
    retriever,
    memory,
    session,
    checkValidity: (dbHandle) => checkExecutionValidity(context, dbHandle),
  };
}
