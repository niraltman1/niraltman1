// rbac-v2.ts — RBAC v2 helpers: system mode + case assignment management
// All functions are additive; used by case-isolation-domain.ts after RBAC v2 migration.

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export type SystemMode = 'single' | 'multi';

/**
 * Returns current system mode from SystemSettings table.
 * Falls back to 'single' if table doesn't exist (pre-migration) or on any error.
 * 'single': any active user accesses any case (firm-wide, no per-attorney restriction).
 * 'multi':  only users with an active CaseAssignment entry may access a case (admin always allowed).
 */
export function getSystemMode(db: DbHandle): SystemMode {
  try {
    const row = db.prepare(
      `SELECT value FROM SystemSettings WHERE key = 'user_mode'`,
    ).get() as { value: string } | undefined;
    return row?.value === 'multi' ? 'multi' : 'single';
  } catch {
    return 'single';
  }
}

/**
 * Sets the system mode. Only callable by admin (enforced at API layer).
 */
export function setSystemMode(mode: SystemMode, db: DbHandle): void {
  db.prepare(
    `INSERT INTO SystemSettings (key, value) VALUES ('user_mode', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(mode);
}

/**
 * Returns the active role for a user on a specific case, or null if not assigned.
 * Ignores revoked assignments (revoked_at IS NOT NULL).
 */
export function getUserCaseRole(
  caseId:    number,
  userId:    number,
  db:        DbHandle,
): string | null {
  const row = db.prepare(
    `SELECT role FROM CaseAssignments
      WHERE case_id = ? AND user_id = ? AND revoked_at IS NULL`,
  ).get(caseId, userId) as { role: string } | undefined;
  return row?.role ?? null;
}

/**
 * Assigns a user to a case with the given role.
 * Uses UPSERT — re-assigning clears revoked_at (reinstates access).
 */
export function assignCaseAccess(
  caseId:     number,
  userId:     number,
  role:       string,
  assignedBy: number,
  db:         DbHandle,
): void {
  db.prepare(
    `INSERT INTO CaseAssignments (case_id, user_id, role, assigned_by, revoked_at, revoked_by)
       VALUES (?, ?, ?, ?, NULL, NULL)
     ON CONFLICT(case_id, user_id)
       DO UPDATE SET role        = excluded.role,
                     assigned_by = excluded.assigned_by,
                     assigned_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                     revoked_at  = NULL,
                     revoked_by  = NULL`,
  ).run(caseId, userId, role, assignedBy);
}

/**
 * Revokes a user's access to a case (soft-delete — preserves audit trail).
 * Does nothing if user was not assigned.
 */
export function revokeCaseAccess(
  caseId:    number,
  userId:    number,
  revokedBy: number,
  db:        DbHandle,
): void {
  db.prepare(
    `UPDATE CaseAssignments
        SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
            revoked_by = ?
      WHERE case_id = ? AND user_id = ? AND revoked_at IS NULL`,
  ).run(revokedBy, caseId, userId);
}

/**
 * Lists all active (non-revoked) assignments for a case.
 */
export function listCaseAssignments(
  caseId: number,
  db:     DbHandle,
): Array<{ id: number; userId: number; username: string; role: string; assignedAt: string }> {
  return (db.prepare(
    `SELECT ca.id, ca.user_id as userId, su.username, ca.role, ca.assigned_at as assignedAt
       FROM CaseAssignments ca
       JOIN system_users su ON su.id = ca.user_id
      WHERE ca.case_id = ? AND ca.revoked_at IS NULL
      ORDER BY ca.assigned_at ASC`,
  ).all(caseId) as Array<{ id: number; userId: number; username: string; role: string; assignedAt: string }>);
}
