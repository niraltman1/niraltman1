-- Migration 025: Expand Contacts actor-network roles + add context_summary column.
-- SQLite requires full table recreation to change CHECK constraints.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE Contacts_v2 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he         TEXT NOT NULL,
  name_en         TEXT,
  role            TEXT NOT NULL DEFAULT 'other'
                  CHECK (role IN (
                    'opposing_counsel','prosecutor','witness','police',
                    'court_clerk','expert','expert_witness','investigator',
                    'co_defendant','family','other'
                  )),
  phone           TEXT,
  email           TEXT,
  organization    TEXT,
  id_number       TEXT,
  notes           TEXT,
  context_summary TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO Contacts_v2
  SELECT id, name_he, name_en, role, phone, email, organization,
         id_number, notes, NULL AS context_summary, created_at, updated_at
  FROM Contacts;

DROP TABLE Contacts;
ALTER TABLE Contacts_v2 RENAME TO Contacts;

CREATE INDEX IF NOT EXISTS idx_contacts_name  ON Contacts(name_he);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON Contacts(email);

DROP TABLE IF EXISTS fts_contacts;
CREATE VIRTUAL TABLE fts_contacts USING fts5(
  name_he, name_en, organization, notes,
  content='Contacts', content_rowid='id',
  tokenize='unicode61'
);

INSERT INTO fts_contacts(rowid, name_he, name_en, organization, notes)
  SELECT id, name_he, name_en, organization, notes FROM Contacts;

DROP TRIGGER IF EXISTS trg_contacts_insert;
CREATE TRIGGER trg_contacts_insert AFTER INSERT ON Contacts BEGIN
  INSERT INTO fts_contacts(rowid, name_he, name_en, organization, notes)
  VALUES (new.id, new.name_he, new.name_en, new.organization, new.notes);
END;

DROP TRIGGER IF EXISTS trg_contacts_update;
CREATE TRIGGER trg_contacts_update AFTER UPDATE ON Contacts BEGIN
  INSERT INTO fts_contacts(fts_contacts, rowid, name_he, name_en, organization, notes)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.organization, old.notes);
  INSERT INTO fts_contacts(rowid, name_he, name_en, organization, notes)
  VALUES (new.id, new.name_he, new.name_en, new.organization, new.notes);
END;

DROP TRIGGER IF EXISTS trg_contacts_delete;
CREATE TRIGGER trg_contacts_delete AFTER DELETE ON Contacts BEGIN
  INSERT INTO fts_contacts(fts_contacts, rowid, name_he, name_en, organization, notes)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.organization, old.notes);
END;

COMMIT;

PRAGMA foreign_keys = ON;
