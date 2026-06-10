-- FACTUM-IL: Messages within a Legal Brain conversation session.
-- Stores both user queries and assistant answers.
-- sources_json holds the retrieved context snippets for each assistant turn.
-- helpful captures attorney satisfaction feedback (0=not helpful, 1=helpful, NULL=no feedback).

CREATE TABLE IF NOT EXISTS LegalBrainMessages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES LegalBrainSessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content      TEXT NOT NULL,
  sources_json TEXT,
  helpful      INTEGER CHECK(helpful IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_lbm_session ON LegalBrainMessages(session_id);
