-- Migration 008: Action Plan
-- Stores proposed rename/move operations for human approval before pipeline execution.
-- source_folder tracks which WatchFolder originated the document (for UI attribution).
-- suggested_path always resolves under the branded office root.

CREATE TABLE IF NOT EXISTS ActionPlan (
  plan_id        TEXT    PRIMARY KEY,
  document_id    INTEGER REFERENCES Documents(id) ON DELETE CASCADE,
  original_name  TEXT    NOT NULL,
  suggested_name TEXT,
  source_folder  TEXT    NOT NULL DEFAULT 'ידני',  -- e.g. "תיקיית הורדות"
  original_path  TEXT    NOT NULL,
  suggested_path TEXT,                             -- always under LegalOS_Root
  action_type    TEXT    NOT NULL DEFAULT 'RENAME'
                 CHECK(action_type IN ('RENAME','MOVE','RENAME_AND_MOVE','SKIP')),
  status         TEXT    NOT NULL DEFAULT 'PENDING'
                 CHECK(status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED')),
  ai_enriched    INTEGER NOT NULL DEFAULT 0 CHECK(ai_enriched IN (0,1)),
  confidence     REAL    CHECK(confidence BETWEEN 0.0 AND 1.0),
  signed_at      TEXT,
  executed_at    TEXT,
  error_message  TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_plan_status
  ON ActionPlan(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_plan_document
  ON ActionPlan(document_id)
  WHERE document_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_action_plan_updated_at
  AFTER UPDATE ON ActionPlan BEGIN
    UPDATE ActionPlan SET updated_at = datetime('now') WHERE plan_id = NEW.plan_id;
  END;
