-- Migration 015: DocumentInsights — structured AI extraction results per document

CREATE TABLE IF NOT EXISTS DocumentInsights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL UNIQUE REFERENCES Documents(id) ON DELETE CASCADE,
  case_number  TEXT,
  court_name   TEXT,
  judge_name   TEXT,
  offense_type TEXT,
  next_hearing TEXT,          -- ISO 8601
  charges      TEXT,          -- JSON array of charge strings
  remedies     TEXT,          -- JSON array (future use)
  confidence   REAL    DEFAULT 0.0,
  model_used   TEXT,
  extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
  raw_response TEXT
);

CREATE INDEX IF NOT EXISTS idx_insights_doc       ON DocumentInsights(document_id);
CREATE INDEX IF NOT EXISTS idx_insights_case_num  ON DocumentInsights(case_number);
