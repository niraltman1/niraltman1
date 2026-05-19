-- Factum IL Master Database Schema
-- SQLite 3.x with WAL mode and FTS5
-- Applies on top of migrations; this file is the canonical reference.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA encoding = 'UTF-8';

-- ─────────────────────────────────────────────
--  Core entity tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS Clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT    UNIQUE,           -- firm-assigned client ID
  name_he     TEXT    NOT NULL,         -- Hebrew full name
  name_en     TEXT,
  id_number   TEXT    UNIQUE,           -- Israeli national ID (Luhn-validated by application)
  id_type     TEXT    NOT NULL DEFAULT 'personal' CHECK (id_type IN ('personal','company','passport','other')),
  phone       TEXT,
  email       TEXT,
  address_he  TEXT,
  notes       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Lawyers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  bar_number  TEXT    UNIQUE NOT NULL,
  name_he     TEXT    NOT NULL,
  name_en     TEXT,
  email       TEXT,
  phone       TEXT,
  specialties TEXT,                     -- JSON array
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Judges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he     TEXT    NOT NULL,
  name_en     TEXT,
  court_name  TEXT,
  court_type  TEXT,                     -- district / magistrate / labour / etc.
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number     TEXT    UNIQUE NOT NULL,
  case_type       TEXT    NOT NULL,     -- civil / criminal / family / labour / administrative
  title_he        TEXT    NOT NULL,
  title_en        TEXT,
  client_id       INTEGER NOT NULL REFERENCES Clients(id) ON DELETE RESTRICT,
  lead_lawyer_id  INTEGER REFERENCES Lawyers(id) ON DELETE SET NULL,
  judge_id        INTEGER REFERENCES Judges(id) ON DELETE SET NULL,
  court_name      TEXT,
  opened_date     TEXT,
  closed_date     TEXT,
  status          TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','suspended','archived')),
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Documents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash        TEXT    NOT NULL UNIQUE,   -- SHA-256 of original file bytes
  original_path    TEXT    NOT NULL,
  storage_path     TEXT    NOT NULL,          -- normalised relative path inside factum-il storage
  filename         TEXT    NOT NULL,
  extension        TEXT    NOT NULL,
  file_size_bytes  INTEGER NOT NULL,
  mime_type        TEXT,
  case_id          INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  client_id        INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  document_type    TEXT,                      -- AI/regex classified type
  document_date    TEXT,                      -- date found in document content
  language         TEXT    DEFAULT 'he',
  ocr_text         TEXT,
  ocr_confidence   REAL,
  processing_state TEXT    NOT NULL DEFAULT 'DISCOVERED'
                   CHECK (processing_state IN (
                     'DISCOVERED','HASHED','OCR_PENDING','OCR_COMPLETE',
                     'CLASSIFIED','ENRICHED','REVIEW_PENDING','APPLIED',
                     'VERIFIED','FAILED','ROLLED_BACK'
                   )),
  page_count       INTEGER,
  is_duplicate     INTEGER NOT NULL DEFAULT 0 CHECK (is_duplicate IN (0,1)),
  duplicate_of     INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  tags             TEXT,                      -- JSON array
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─────────────────────────────────────────────
--  Processing & audit tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ProcessingStatus (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id    INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  from_state     TEXT    NOT NULL,
  to_state       TEXT    NOT NULL,
  agent          TEXT    NOT NULL,      -- which agent performed the transition
  success        INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
  error_message  TEXT,
  duration_ms    INTEGER,
  transitioned_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ActionLog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id   TEXT    NOT NULL,      -- UUID for this operation
  operation_type TEXT    NOT NULL,      -- MOVE / RENAME / OCR / ENRICH / ROLLBACK / etc.
  document_id    INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  agent          TEXT    NOT NULL,
  file_hash_before TEXT,
  file_hash_after  TEXT,
  path_before    TEXT,
  path_after     TEXT,
  metadata_json  TEXT,                  -- arbitrary JSON payload
  is_reversible  INTEGER NOT NULL DEFAULT 1 CHECK (is_reversible IN (0,1)),
  rolled_back    INTEGER NOT NULL DEFAULT 0 CHECK (rolled_back IN (0,1)),
  rollback_action_id INTEGER REFERENCES ActionLog(id) ON DELETE SET NULL,
  logged_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ManifestSnapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id     TEXT    NOT NULL UNIQUE,  -- UUID
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  snapshot_data   TEXT    NOT NULL,          -- JSON snapshot of document row at time of snapshot
  file_hash       TEXT    NOT NULL,
  original_path   TEXT    NOT NULL,
  storage_path    TEXT    NOT NULL,
  original_mtime  TEXT,                      -- ISO-8601 file modification time
  original_size   INTEGER NOT NULL,
  trigger_event   TEXT    NOT NULL,          -- what triggered the snapshot
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS AIEnrichment (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  model_name      TEXT    NOT NULL,
  prompt_hash     TEXT    NOT NULL,          -- SHA-256 of the prompt used
  response_json   TEXT    NOT NULL,          -- raw LLM JSON response
  confidence      REAL    NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  fields_enriched TEXT    NOT NULL,          -- JSON array of field names set by AI
  validated       INTEGER NOT NULL DEFAULT 0 CHECK (validated IN (0,1)),
  applied         INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1)),
  enriched_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ─────────────────────────────────────────────
--  Indexes
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_case_id        ON Documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id      ON Documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_processing_state ON Documents(processing_state);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash      ON Documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_created_at     ON Documents(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_client_id          ON Cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status             ON Cases(status);
CREATE INDEX IF NOT EXISTS idx_actionlog_document_id    ON ActionLog(document_id);
CREATE INDEX IF NOT EXISTS idx_actionlog_operation_id   ON ActionLog(operation_id);
CREATE INDEX IF NOT EXISTS idx_actionlog_logged_at      ON ActionLog(logged_at);
CREATE INDEX IF NOT EXISTS idx_processingstatus_document_id ON ProcessingStatus(document_id);
CREATE INDEX IF NOT EXISTS idx_manifests_document_id    ON ManifestSnapshots(document_id);
CREATE INDEX IF NOT EXISTS idx_manifests_snapshot_id    ON ManifestSnapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_aienrichment_document_id ON AIEnrichment(document_id);
