-- Migration 037: Product Stabilization, Reliability & Observability

-- AI provenance tracking on DocumentInsights (Section 7: Explainability)
ALTER TABLE DocumentInsights ADD COLUMN source_page        INTEGER;
ALTER TABLE DocumentInsights ADD COLUMN ocr_confidence     REAL;
ALTER TABLE DocumentInsights ADD COLUMN ai_model_version   TEXT;
ALTER TABLE DocumentInsights ADD COLUMN extraction_method  TEXT
  CHECK (extraction_method IN ('regex','ai','hybrid','manual') OR extraction_method IS NULL);
ALTER TABLE DocumentInsights ADD COLUMN verification_state TEXT NOT NULL DEFAULT 'unverified'
  CHECK (verification_state IN ('unverified','approved','rejected','review_required'));

-- Application-level activity events (Section 6: Activity Feed)
CREATE TABLE activity_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL
               CHECK (kind IN ('ocr_completed','ocr_failed','entities_extracted','deadline_detected',
                               'precedent_matched','ai_summary_generated','verification_completed',
                               'export_completed','sync_completed','document_ingested',
                               'queue_failure','queue_retry','watcher_event')),
  case_id      INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  document_id  INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  source       TEXT,
  confidence   REAL,
  message      TEXT,
  details_json TEXT,
  emitted_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_activity_case     ON activity_events(case_id);
CREATE INDEX idx_activity_document ON activity_events(document_id);
CREATE INDEX idx_activity_kind     ON activity_events(kind);
CREATE INDEX idx_activity_emitted  ON activity_events(emitted_at);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (37, '037_reliability', 'sha256-placeholder-037');
