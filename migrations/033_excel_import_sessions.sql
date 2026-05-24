-- Migration 033: Excel Import Sessions
-- Tracks each fuzzy Excel/CSV import operation with column mapping results.

CREATE TABLE IF NOT EXISTS excel_import_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  filename      TEXT    NOT NULL,
  source_type   TEXT    NOT NULL
                CHECK (source_type IN ('net_hamishpat','execution_office','generic')),
  rows_total    INTEGER NOT NULL DEFAULT 0,
  rows_imported INTEGER NOT NULL DEFAULT 0,
  rows_skipped  INTEGER NOT NULL DEFAULT 0,
  rows_updated  INTEGER NOT NULL DEFAULT 0,
  column_map    TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  error_summary TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (33, '033_excel_import_sessions', 'sha256-placeholder-033');
