CREATE TABLE IF NOT EXISTS LearningFeedback (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  field_name      TEXT NOT NULL,
  original_value  TEXT,
  corrected_value TEXT NOT NULL,
  corrected_by    TEXT NOT NULL DEFAULT 'user',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lf_document ON LearningFeedback(document_id);
CREATE INDEX IF NOT EXISTS idx_lf_field    ON LearningFeedback(field_name);
