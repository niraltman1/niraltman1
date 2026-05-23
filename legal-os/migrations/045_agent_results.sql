CREATE TABLE IF NOT EXISTS AgentResults (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name    TEXT NOT NULL,
  trace_id      TEXT NOT NULL UNIQUE,
  case_id       INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  document_id   INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  result_text   TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0.0,
  flag_review   INTEGER NOT NULL DEFAULT 0,  -- boolean
  tool_log      TEXT NOT NULL DEFAULT '[]',  -- JSON array of ToolResult
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_results_case  ON AgentResults(case_id);
CREATE INDEX IF NOT EXISTS idx_agent_results_agent ON AgentResults(agent_name, created_at);
