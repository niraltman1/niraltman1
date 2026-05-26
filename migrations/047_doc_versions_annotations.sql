CREATE TABLE IF NOT EXISTS DocumentVersions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  file_hash     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  filename      TEXT NOT NULL,
  created_by    TEXT,
  change_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_document ON DocumentVersions(document_id);

CREATE TABLE IF NOT EXISTS Annotations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  page_number     INTEGER NOT NULL DEFAULT 1,
  annotation_type TEXT NOT NULL CHECK(annotation_type IN ('highlight','note','redline','bookmark')),
  color           TEXT,
  x               REAL,
  y               REAL,
  width           REAL,
  height          REAL,
  content         TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_annotations_document ON Annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_page ON Annotations(document_id, page_number);
