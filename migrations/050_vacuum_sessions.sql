-- Migration 023: Vacuum Protocol session tracking

CREATE TABLE IF NOT EXISTS VacuumSessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_uuid        TEXT    NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  target_path         TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','discovery','processing_ocr',
                                       'locking_evidence','indexing_ai','completed','failed')),
  progress_percentage INTEGER NOT NULL DEFAULT 0
                      CHECK(progress_percentage BETWEEN 0 AND 100),
  current_step_text   TEXT,
  raw_logs            TEXT    NOT NULL DEFAULT '',
  started_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_vacuum_sessions_status
  ON VacuumSessions(status, started_at DESC);
