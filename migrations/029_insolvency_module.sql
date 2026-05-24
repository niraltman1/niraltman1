-- Migration 029: Insolvency Module — Two-Phase State Machine + Cases Procedure Type Extension
-- Adds 'insolvency' to Cases.procedure_type CHECK (requires full table recreation).
-- Creates insolvency_filings and insolvency_checklist_items tables.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Recreate Cases with 'insolvency' added to procedure_type CHECK
CREATE TABLE Cases_v2 (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  case_number    TEXT    UNIQUE NOT NULL,
  case_type      TEXT    NOT NULL,
  title_he       TEXT    NOT NULL,
  title_en       TEXT,
  client_id      INTEGER NOT NULL REFERENCES Clients(id) ON DELETE RESTRICT,
  lead_lawyer_id INTEGER REFERENCES Lawyers(id) ON DELETE SET NULL,
  judge_id       INTEGER REFERENCES Judges(id) ON DELETE SET NULL,
  court_name     TEXT,
  opened_date    TEXT,
  closed_date    TEXT,
  status         TEXT    NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','closed','suspended','archived')),
  notes          TEXT,
  judge_name     TEXT,
  procedure_type TEXT    DEFAULT 'civil'
                 CHECK (procedure_type IN (
                   'civil','traffic_administrative','traffic_criminal','academic','insolvency'
                 )),
  statute_deadline TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO Cases_v2
  SELECT id, case_number, case_type, title_he, title_en,
         client_id, lead_lawyer_id, judge_id, court_name,
         opened_date, closed_date, status, notes,
         judge_name, procedure_type, statute_deadline,
         created_at, updated_at
  FROM Cases;

DROP TABLE Cases;
ALTER TABLE Cases_v2 RENAME TO Cases;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON Cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status    ON Cases(status);

-- Recreate FTS triggers (dropped with the old Cases table)
DROP TRIGGER IF EXISTS trg_fts_cases_insert;
CREATE TRIGGER trg_fts_cases_insert
  AFTER INSERT ON Cases BEGIN
    INSERT INTO fts_cases(rowid, case_number, title_he, title_en, notes)
    VALUES (new.id, new.case_number, new.title_he, new.title_en, new.notes);
  END;

DROP TRIGGER IF EXISTS trg_fts_cases_update;
CREATE TRIGGER trg_fts_cases_update
  AFTER UPDATE ON Cases BEGIN
    INSERT INTO fts_cases(fts_cases, rowid, case_number, title_he, title_en, notes)
    VALUES ('delete', old.id, old.case_number, old.title_he, old.title_en, old.notes);
    INSERT INTO fts_cases(rowid, case_number, title_he, title_en, notes)
    VALUES (new.id, new.case_number, new.title_he, new.title_en, new.notes);
  END;

DROP TRIGGER IF EXISTS trg_fts_cases_delete;
CREATE TRIGGER trg_fts_cases_delete
  AFTER DELETE ON Cases BEGIN
    INSERT INTO fts_cases(fts_cases, rowid, case_number, title_he, title_en, notes)
    VALUES ('delete', old.id, old.case_number, old.title_he, old.title_en, old.notes);
  END;

COMMIT;

PRAGMA foreign_keys = ON;

-- Insolvency filing header (one per case)
CREATE TABLE IF NOT EXISTS insolvency_filings (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id            INTEGER NOT NULL UNIQUE REFERENCES Cases(id) ON DELETE CASCADE,
  phase              TEXT    NOT NULL DEFAULT 'Pre_Filing'
                     CHECK (phase IN ('Pre_Filing','Judicial_Litigation')),
  official_receiver  TEXT,
  trustee_name       TEXT,
  form5_submitted_at TEXT,
  phase_changed_at   TEXT,
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_insolvency_case  ON insolvency_filings(case_id);
CREATE INDEX IF NOT EXISTS idx_insolvency_phase ON insolvency_filings(phase);

-- Form 5 checklist items (Sections A–E)
CREATE TABLE IF NOT EXISTS insolvency_checklist_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES insolvency_filings(id) ON DELETE CASCADE,
  section   TEXT    NOT NULL CHECK (section IN ('A','B','C','D','E')),
  field_key TEXT    NOT NULL,
  label_he  TEXT    NOT NULL,
  status    TEXT    NOT NULL DEFAULT 'missing'
            CHECK (status IN ('missing','partial','complete')),
  value     TEXT,
  updated_at TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(filing_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_ici_filing  ON insolvency_checklist_items(filing_id);
CREATE INDEX IF NOT EXISTS idx_ici_status  ON insolvency_checklist_items(status);
CREATE INDEX IF NOT EXISTS idx_ici_section ON insolvency_checklist_items(section);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (29, '029_insolvency_module', 'sha256-placeholder-029');
