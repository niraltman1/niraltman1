-- Migration 011: SHA-256 Deduplication Registry for Vacuum 2.0 Media Processing
--
-- ProcessedFiles is a *permanent* record of every file ever processed by the system.
-- It survives queue cleanup and serves as the gating check before any CPU-heavy
-- OCR or image conversion. If hash exists → skip. If path changed but hash same → update path only.

CREATE TABLE IF NOT EXISTS ProcessedFiles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash           TEXT    NOT NULL UNIQUE,          -- SHA-256 hex digest
  original_path       TEXT    NOT NULL,                 -- path at first ingestion
  current_path        TEXT    NOT NULL,                 -- may change if file moved
  original_name       TEXT    NOT NULL,
  converted_pdf_path  TEXT,                             -- set when image → PDF conversion done
  file_size_bytes     INTEGER,
  mime_type           TEXT,
  processing_status   TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (processing_status IN (
                        'pending','hashing','converting','ocr','complete','failed','skipped'
                      )),
  skip_reason         TEXT,                             -- 'already_registered' | 'path_updated'
  ocr_text_preview    TEXT,                             -- first 500 chars of OCR output
  document_id         INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  client_id           INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  metadata_json       TEXT,                             -- free JSON blob for extensibility
  last_scanned        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_pf_hash    ON ProcessedFiles(file_hash);
CREATE INDEX IF NOT EXISTS idx_pf_path    ON ProcessedFiles(current_path);
CREATE INDEX IF NOT EXISTS idx_pf_status  ON ProcessedFiles(processing_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pf_client  ON ProcessedFiles(client_id);
CREATE INDEX IF NOT EXISTS idx_pf_doc     ON ProcessedFiles(document_id);
