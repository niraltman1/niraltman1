-- Migration 004: ProcessingStatus and AIEnrichment tables

CREATE TABLE IF NOT EXISTS ProcessingStatus (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  from_state      TEXT    NOT NULL,
  to_state        TEXT    NOT NULL,
  agent           TEXT    NOT NULL,
  success         INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
  error_message   TEXT,
  duration_ms     INTEGER,
  transitioned_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS AIEnrichment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  model_name      TEXT    NOT NULL,
  prompt_hash     TEXT    NOT NULL,
  response_json   TEXT    NOT NULL,
  confidence      REAL    NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  fields_enriched TEXT    NOT NULL,
  validated       INTEGER NOT NULL DEFAULT 0 CHECK (validated IN (0,1)),
  applied         INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1)),
  enriched_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Updated_at triggers for Clients, Cases, Documents, Lawyers, Judges
CREATE TRIGGER IF NOT EXISTS trg_clients_updated_at
  AFTER UPDATE ON Clients BEGIN
    UPDATE Clients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_cases_updated_at
  AFTER UPDATE ON Cases BEGIN
    UPDATE Cases SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
  AFTER UPDATE ON Documents BEGIN
    UPDATE Documents SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_lawyers_updated_at
  AFTER UPDATE ON Lawyers BEGIN
    UPDATE Lawyers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_judges_updated_at
  AFTER UPDATE ON Judges BEGIN
    UPDATE Judges SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

CREATE INDEX IF NOT EXISTS idx_processingstatus_document_id ON ProcessingStatus(document_id);
CREATE INDEX IF NOT EXISTS idx_processingstatus_to_state    ON ProcessingStatus(to_state);
CREATE INDEX IF NOT EXISTS idx_aienrichment_document_id     ON AIEnrichment(document_id);
CREATE INDEX IF NOT EXISTS idx_aienrichment_validated       ON AIEnrichment(validated);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (4, '004_processing_status', 'sha256-placeholder-004');
