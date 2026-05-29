-- FACTUM-IL: Per-attorney case access assignments (RBAC v2)
CREATE TABLE IF NOT EXISTS CaseAssignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'attorney'
               CHECK (role IN ('attorney','assistant','reviewer','read_only')),
  assigned_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  assigned_by  INTEGER REFERENCES system_users(id),
  revoked_at   TEXT,
  revoked_by   INTEGER REFERENCES system_users(id),
  UNIQUE(case_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ca_case   ON CaseAssignments(case_id);
CREATE INDEX IF NOT EXISTS idx_ca_user   ON CaseAssignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_active ON CaseAssignments(case_id, user_id)
  WHERE revoked_at IS NULL;
