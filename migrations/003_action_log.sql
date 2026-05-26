-- Migration 003: ActionLog and ManifestSnapshots tables

CREATE TABLE IF NOT EXISTS ActionLog (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id       TEXT    NOT NULL,
  operation_type     TEXT    NOT NULL,
  document_id        INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  agent              TEXT    NOT NULL,
  file_hash_before   TEXT,
  file_hash_after    TEXT,
  path_before        TEXT,
  path_after         TEXT,
  metadata_json      TEXT,
  is_reversible      INTEGER NOT NULL DEFAULT 1 CHECK (is_reversible IN (0,1)),
  rolled_back        INTEGER NOT NULL DEFAULT 0 CHECK (rolled_back IN (0,1)),
  rollback_action_id INTEGER REFERENCES ActionLog(id) ON DELETE SET NULL,
  logged_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ManifestSnapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id     TEXT    NOT NULL UNIQUE,
  document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  snapshot_data   TEXT    NOT NULL,
  file_hash       TEXT    NOT NULL,
  original_path   TEXT    NOT NULL,
  storage_path    TEXT    NOT NULL,
  original_mtime  TEXT,
  original_size   INTEGER NOT NULL,
  trigger_event   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_actionlog_document_id   ON ActionLog(document_id);
CREATE INDEX IF NOT EXISTS idx_actionlog_operation_id  ON ActionLog(operation_id);
CREATE INDEX IF NOT EXISTS idx_actionlog_logged_at     ON ActionLog(logged_at);
CREATE INDEX IF NOT EXISTS idx_actionlog_rolled_back   ON ActionLog(rolled_back);
CREATE INDEX IF NOT EXISTS idx_manifests_document_id   ON ManifestSnapshots(document_id);
CREATE INDEX IF NOT EXISTS idx_manifests_snapshot_id   ON ManifestSnapshots(snapshot_id);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (3, '003_action_log', 'sha256-placeholder-003');
