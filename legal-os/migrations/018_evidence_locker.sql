-- Migration 018: Evidence Locker — immutable archive for WhatsApp originals and other evidence

CREATE TABLE IF NOT EXISTS EvidenceItems (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id       INTEGER REFERENCES Documents(id)  ON DELETE SET NULL,
  case_id           INTEGER REFERENCES Cases(id)       ON DELETE SET NULL,
  client_id         INTEGER REFERENCES Clients(id)    ON DELETE SET NULL,
  original_path     TEXT NOT NULL,
  locker_path       TEXT NOT NULL UNIQUE,
  file_hash         TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type         TEXT,
  source_app        TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK(source_app IN ('whatsapp','email','manual')),
  media_type        TEXT NOT NULL DEFAULT 'file'
                    CHECK(media_type IN ('voice_note','image','message','attachment','file')),
  ocr_text          TEXT,
  is_write_protected INTEGER NOT NULL DEFAULT 0 CHECK(is_write_protected IN (0,1)),
  notes             TEXT,
  locked_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_case   ON EvidenceItems(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_client ON EvidenceItems(client_id);
CREATE INDEX IF NOT EXISTS idx_evidence_hash   ON EvidenceItems(file_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON EvidenceItems(source_app, media_type);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_evidence
  USING fts5(original_filename, ocr_text, content=EvidenceItems, content_rowid=id);

CREATE TRIGGER IF NOT EXISTS fts_ev_insert AFTER INSERT ON EvidenceItems BEGIN
  INSERT INTO fts_evidence(rowid, original_filename, ocr_text)
  VALUES (new.id, new.original_filename, new.ocr_text);
END;

CREATE TRIGGER IF NOT EXISTS fts_ev_update AFTER UPDATE ON EvidenceItems BEGIN
  INSERT INTO fts_evidence(fts_evidence, rowid, original_filename, ocr_text)
  VALUES ('delete', old.id, old.original_filename, old.ocr_text);
  INSERT INTO fts_evidence(rowid, original_filename, ocr_text)
  VALUES (new.id, new.original_filename, new.ocr_text);
END;

CREATE TRIGGER IF NOT EXISTS fts_ev_delete AFTER DELETE ON EvidenceItems BEGIN
  INSERT INTO fts_evidence(fts_evidence, rowid, original_filename, ocr_text)
  VALUES ('delete', old.id, old.original_filename, old.ocr_text);
END;
