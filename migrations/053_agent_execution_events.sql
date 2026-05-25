-- Append-only audit journal for agent execution lifecycle events.
-- Strictly additive — does not modify any existing tables.
-- event_type values: execution_started, execution_completed, execution_failed,
--   stale_detected, concurrency_blocked, retrieval_fallback, authorization_failed

CREATE TABLE IF NOT EXISTS AgentExecutionEvents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id  TEXT    NOT NULL,
  case_id       INTEGER,
  user_id       TEXT,
  event_type    TEXT    NOT NULL,
  payload_json  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_aee_execution_id ON AgentExecutionEvents(execution_id);
CREATE INDEX IF NOT EXISTS idx_aee_case_id      ON AgentExecutionEvents(case_id);
CREATE INDEX IF NOT EXISTS idx_aee_event_type   ON AgentExecutionEvents(event_type);
CREATE INDEX IF NOT EXISTS idx_aee_created_at   ON AgentExecutionEvents(created_at);
