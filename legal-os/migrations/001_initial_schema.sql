-- Migration 001: Initial schema
-- Creates core entity tables: Clients, Lawyers, Judges, Cases, Documents

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     INTEGER NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checksum    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS Clients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT    UNIQUE,
  name_he     TEXT    NOT NULL,
  name_en     TEXT,
  id_number   TEXT    UNIQUE,
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
  specialties TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Judges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he     TEXT    NOT NULL,
  name_en     TEXT,
  court_name  TEXT,
  court_type  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS Cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number     TEXT    UNIQUE NOT NULL,
  case_type       TEXT    NOT NULL,
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
  file_hash        TEXT    NOT NULL UNIQUE,
  original_path    TEXT    NOT NULL,
  storage_path     TEXT    NOT NULL,
  filename         TEXT    NOT NULL,
  extension        TEXT    NOT NULL,
  file_size_bytes  INTEGER NOT NULL,
  mime_type        TEXT,
  case_id          INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  client_id        INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  document_type    TEXT,
  document_date    TEXT,
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
  tags             TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_case_id        ON Documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id      ON Documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_processing_state ON Documents(processing_state);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash      ON Documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_created_at     ON Documents(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_client_id          ON Cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status             ON Cases(status);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (1, '001_initial_schema', 'sha256-placeholder-001');
