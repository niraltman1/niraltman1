CREATE TABLE IF NOT EXISTS CaseMemory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK(kind IN ('entity','risk','reasoning','summary','citation','timeline')),
  content     TEXT NOT NULL,
  confidence  REAL NOT NULL DEFAULT 1.0,
  agent_name  TEXT NOT NULL,
  trace_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_case_memory_case ON CaseMemory(case_id, kind);
CREATE INDEX IF NOT EXISTS idx_case_memory_trace ON CaseMemory(trace_id);

CREATE TABLE IF NOT EXISTS UserPreferences (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  pref_key   TEXT NOT NULL,
  pref_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, pref_key)
);

CREATE TABLE IF NOT EXISTS AgentRunLog (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name   TEXT NOT NULL,
  trace_id     TEXT NOT NULL UNIQUE,
  case_id      INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  status       TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
  duration_ms  INTEGER,
  error        TEXT,
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_run_case ON AgentRunLog(case_id);
