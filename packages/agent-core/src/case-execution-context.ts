import { createHash } from 'node:crypto';

interface DbHandle {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
  };
}

export interface CaseExecutionContext {
  readonly caseId:        number;
  readonly userId:        string;
  readonly requestedAt:   string;   // ISO-8601 timestamp when the request arrived
  readonly caseStateHash: string;   // first 16 hex chars of SHA-256 over mutable state
}

interface CaseStateRow {
  status:     string;
  updated_at: string;
  doc_count:  number;
}

/** Computes a lightweight hash over the mutable fields of a case. */
export function computeCaseStateHash(caseId: number, db: DbHandle): string {
  const row = db.prepare(`
    SELECT c.status, c.updated_at,
           (SELECT COUNT(*) FROM Documents WHERE case_id = c.id) AS doc_count
      FROM Cases c WHERE c.id = ?
  `).get(caseId) as CaseStateRow | undefined;

  if (!row) return 'not-found';
  const payload = `${row.status}|${row.updated_at}|${row.doc_count}`;
  return createHash('sha256').update(payload, 'utf-8').digest('hex').slice(0, 16);
}

export interface ValidityResult {
  valid:   boolean;
  reason?: string;
}

/**
 * Checks whether the case state at call-time still matches the hash captured
 * at request time. Returns an object with { valid, reason } — NEVER throws.
 * The caller decides how to surface a stale result (e.g. isStale flag in the
 * API response so the React UI can show a "re-run" prompt).
 */
export function checkExecutionValidity(
  ctx: CaseExecutionContext,
  db:  DbHandle,
): ValidityResult {
  try {
    const current = computeCaseStateHash(ctx.caseId, db);
    if (current === 'not-found') {
      return { valid: false, reason: `Case ${ctx.caseId} no longer exists` };
    }
    if (current !== ctx.caseStateHash) {
      return {
        valid:  false,
        reason: `Case ${ctx.caseId} was modified after this request was queued — results may be outdated`,
      };
    }
    return { valid: true };
  } catch {
    // DB errors must not crash agent execution
    return { valid: true }; // optimistic: let the agent continue
  }
}
