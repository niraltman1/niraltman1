-- FACTUM-IL: Legal Brain conversation sessions.
-- Each session is a named, multi-turn conversation thread, optionally scoped to a case.
-- Sessions persist across restarts (stored in main DB, not in memory).

CREATE TABLE IF NOT EXISTS LegalBrainSessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT,
  case_id    INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  user_id    TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_lbs_user   ON LegalBrainSessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lbs_case   ON LegalBrainSessions(case_id);
CREATE INDEX IF NOT EXISTS idx_lbs_updated ON LegalBrainSessions(updated_at DESC);
