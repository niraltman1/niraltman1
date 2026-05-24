-- Migration 024: PipelineLogs — per-file event log for the ingestion pipeline.
--
-- Each row records one significant stage-transition for a scanned file.
-- The scan-summary endpoint aggregates the most-recent entry per file to
-- produce the live report shown in ScanSummaryReport.

CREATE TABLE IF NOT EXISTS PipelineLogs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash           TEXT,                              -- SHA-256 of the file (null if hashing failed)
  file_name           TEXT    NOT NULL,
  status              TEXT    NOT NULL
                      CHECK (status IN (
                        'processing',
                        'ocr_success',
                        'failed_ocr',
                        'ai_resolved',
                        'failed_ai',
                        'excluded',
                        'duplicate'
                      )),
  error_message       TEXT,
  extracted_client_id INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  client_provisioned  INTEGER NOT NULL DEFAULT 0,        -- 1 = auto-created by preflight
  urgency_level       TEXT,                              -- from Sub-Agent B
  sentiment           TEXT,                              -- from Sub-Agent B
  timestamp           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_pl_status    ON PipelineLogs(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pl_hash      ON PipelineLogs(file_hash);
CREATE INDEX IF NOT EXISTS idx_pl_client    ON PipelineLogs(extracted_client_id);
CREATE INDEX IF NOT EXISTS idx_pl_timestamp ON PipelineLogs(timestamp DESC);
