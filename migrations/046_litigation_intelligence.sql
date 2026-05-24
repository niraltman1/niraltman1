CREATE TABLE IF NOT EXISTS ProceduralChecklist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  rule_id      INTEGER REFERENCES Rules_Engine(id) ON DELETE SET NULL,
  step_name    TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('pending','complete','missing','overdue')) DEFAULT 'pending',
  due_date     TEXT,
  completed_at TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(case_id, step_name)
);
CREATE INDEX IF NOT EXISTS idx_checklist_case ON ProceduralChecklist(case_id, status);

CREATE TABLE IF NOT EXISTS RiskAssessments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  risk_score   REAL NOT NULL,
  risk_factors TEXT NOT NULL DEFAULT '[]',  -- JSON array of {factor, severity, description}
  agent_name   TEXT NOT NULL,
  trace_id     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_risk_case ON RiskAssessments(case_id);
