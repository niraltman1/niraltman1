CREATE TABLE IF NOT EXISTS WorkflowStates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL CHECK(stage IN (
                'OCR_DONE','ENTITY_EXTRACTION_DONE','INDEXING_DONE',
                'MEMORY_WRITTEN','READY_FOR_AGENTS')),
  status      TEXT NOT NULL CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED'))
              DEFAULT 'PENDING',
  version     INTEGER NOT NULL DEFAULT 1,
  error       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_workflow_doc ON WorkflowStates(document_id, stage);

CREATE TABLE IF NOT EXISTS WorkflowIdempotencyLog (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  processed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS AgentRunRegistry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type  TEXT NOT NULL,
  case_id     INTEGER REFERENCES Cases(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES Documents(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK(status IN ('running','completed','failed')) DEFAULT 'running',
  trace_id    TEXT NOT NULL UNIQUE,
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  UNIQUE(agent_type, case_id, status)
);
