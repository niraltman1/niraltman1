-- Migration 002: FTS5 full-text search indexes

CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents USING fts5(
  filename,
  ocr_text,
  document_type,
  tags,
  content='Documents',
  content_rowid='id',
  tokenize='unicode61'
);

-- Sync triggers: keep FTS in sync with Documents table
CREATE TRIGGER IF NOT EXISTS trg_fts_documents_insert
  AFTER INSERT ON Documents BEGIN
    INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
    VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_documents_update
  AFTER UPDATE ON Documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
    VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
    INSERT INTO fts_documents(rowid, filename, ocr_text, document_type, tags)
    VALUES (new.id, new.filename, new.ocr_text, new.document_type, new.tags);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_documents_delete
  AFTER DELETE ON Documents BEGIN
    INSERT INTO fts_documents(fts_documents, rowid, filename, ocr_text, document_type, tags)
    VALUES ('delete', old.id, old.filename, old.ocr_text, old.document_type, old.tags);
  END;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_clients USING fts5(
  name_he,
  name_en,
  id_number,
  notes,
  content='Clients',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_fts_clients_insert
  AFTER INSERT ON Clients BEGIN
    INSERT INTO fts_clients(rowid, name_he, name_en, id_number, notes)
    VALUES (new.id, new.name_he, new.name_en, new.id_number, new.notes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_clients_update
  AFTER UPDATE ON Clients BEGIN
    INSERT INTO fts_clients(fts_clients, rowid, name_he, name_en, id_number, notes)
    VALUES ('delete', old.id, old.name_he, old.name_en, old.id_number, old.notes);
    INSERT INTO fts_clients(rowid, name_he, name_en, id_number, notes)
    VALUES (new.id, new.name_he, new.name_en, new.id_number, new.notes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_clients_delete
  AFTER DELETE ON Clients BEGIN
    INSERT INTO fts_clients(fts_clients, rowid, name_he, name_en, id_number, notes)
    VALUES ('delete', old.id, old.name_he, old.name_en, old.id_number, old.notes);
  END;

CREATE VIRTUAL TABLE IF NOT EXISTS fts_cases USING fts5(
  case_number,
  title_he,
  title_en,
  notes,
  content='Cases',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_fts_cases_insert
  AFTER INSERT ON Cases BEGIN
    INSERT INTO fts_cases(rowid, case_number, title_he, title_en, notes)
    VALUES (new.id, new.case_number, new.title_he, new.title_en, new.notes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_cases_update
  AFTER UPDATE ON Cases BEGIN
    INSERT INTO fts_cases(fts_cases, rowid, case_number, title_he, title_en, notes)
    VALUES ('delete', old.id, old.case_number, old.title_he, old.title_en, old.notes);
    INSERT INTO fts_cases(rowid, case_number, title_he, title_en, notes)
    VALUES (new.id, new.case_number, new.title_he, new.title_en, new.notes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_cases_delete
  AFTER DELETE ON Cases BEGIN
    INSERT INTO fts_cases(fts_cases, rowid, case_number, title_he, title_en, notes)
    VALUES ('delete', old.id, old.case_number, old.title_he, old.title_en, old.notes);
  END;

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (2, '002_fts5_indexes', 'sha256-placeholder-002');
