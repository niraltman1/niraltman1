-- Phase 12: Many-to-Many CRM
-- A Contact can be linked to multiple Cases (and vice-versa).
-- Contacts are independent of Clients — they represent external parties:
-- opposing counsel, witnesses, police officers, prosecutors, etc.

CREATE TABLE IF NOT EXISTS Contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he       TEXT NOT NULL,
  name_en       TEXT,
  role          TEXT NOT NULL DEFAULT 'other'
                CHECK (role IN ('opposing_counsel','prosecutor','witness','police',
                                'court_clerk','expert','family','other')),
  phone         TEXT,
  email         TEXT,
  organization  TEXT,
  id_number     TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_name  ON Contacts(name_he);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON Contacts(email);

-- Junction table: Contact ↔ Case (many-to-many)
CREATE TABLE IF NOT EXISTS CaseContacts (
  case_id     INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  contact_id  INTEGER NOT NULL REFERENCES Contacts(id) ON DELETE CASCADE,
  role_in_case TEXT,           -- e.g. "עד הגנה", "עורך דין נגדי"
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (case_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_case_contacts_case    ON CaseContacts(case_id);
CREATE INDEX IF NOT EXISTS idx_case_contacts_contact ON CaseContacts(contact_id);

-- FTS5 index for contacts
CREATE VIRTUAL TABLE IF NOT EXISTS fts_contacts USING fts5(
  name_he, name_en, organization, notes,
  content='Contacts', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_contacts_insert AFTER INSERT ON Contacts BEGIN
  INSERT INTO fts_contacts(rowid, name_he, name_en, organization, notes)
  VALUES (new.id, new.name_he, new.name_en, new.organization, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS trg_contacts_update AFTER UPDATE ON Contacts BEGIN
  INSERT INTO fts_contacts(fts_contacts, rowid, name_he, name_en, organization, notes)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.organization, old.notes);
  INSERT INTO fts_contacts(rowid, name_he, name_en, organization, notes)
  VALUES (new.id, new.name_he, new.name_en, new.organization, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS trg_contacts_delete AFTER DELETE ON Contacts BEGIN
  INSERT INTO fts_contacts(fts_contacts, rowid, name_he, name_en, organization, notes)
  VALUES ('delete', old.id, old.name_he, old.name_en, old.organization, old.notes);
END;
