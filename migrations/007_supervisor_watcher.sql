-- Migration 007: Supervisor, File Watcher, Backup Snapshots, Search Materialization
-- Applies after: 006_search_ai_hardening.sql

-- ─────────────────────────────────────────────────────────────────────────────
--  Worker health registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS WorkerHealth (
  worker_id        TEXT    PRIMARY KEY,
  worker_type      TEXT    NOT NULL CHECK(worker_type IN ('ocr','classify','enrich','watcher','supervisor')),
  pid              INTEGER,
  status           TEXT    NOT NULL DEFAULT 'starting'
                           CHECK(status IN ('starting','idle','busy','stopping','dead')),
  memory_mb        REAL,
  tasks_completed  INTEGER NOT NULL DEFAULT 0,
  tasks_failed     INTEGER NOT NULL DEFAULT 0,
  current_task     TEXT,
  last_heartbeat   TEXT,
  started_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_worker_health_status
  ON WorkerHealth(status, last_heartbeat);

-- ─────────────────────────────────────────────────────────────────────────────
--  File watcher event log (debounce tracking + duplicate suppression)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS WatcherEvents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type     TEXT    NOT NULL CHECK(event_type IN ('added','changed','renamed','removed')),
  file_path      TEXT    NOT NULL,
  file_hash      TEXT,
  debounce_key   TEXT    NOT NULL,
  processed      INTEGER NOT NULL DEFAULT 0,
  queued         INTEGER NOT NULL DEFAULT 0,
  duplicate      INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  occurred_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  processed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_watcher_events_unprocessed
  ON WatcherEvents(processed, occurred_at)
  WHERE processed = 0;

CREATE INDEX IF NOT EXISTS idx_watcher_events_hash
  ON WatcherEvents(file_hash)
  WHERE file_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
--  Backup snapshot registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS BackupSnapshots (
  snapshot_id     TEXT    PRIMARY KEY,
  backup_path     TEXT    NOT NULL,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  document_count  INTEGER NOT NULL DEFAULT 0,
  db_integrity    TEXT    NOT NULL DEFAULT 'unchecked'
                          CHECK(db_integrity IN ('unchecked','ok','error')),
  verified        INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created
  ON BackupSnapshots(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Materialized search metadata (for sub-200ms indexed pre-filter)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS SearchMeta (
  document_id      INTEGER PRIMARY KEY REFERENCES Documents(id) ON DELETE CASCADE,
  document_type    TEXT,
  processing_state TEXT    NOT NULL,
  document_date    TEXT,          -- ISO 8601 for range filtering
  client_id        INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  case_id          INTEGER REFERENCES Cases(id)   ON DELETE SET NULL,
  confidence       REAL,
  page_count       INTEGER,
  language         TEXT    CHECK(language IN ('he','en','mixed')),
  file_size_bytes  INTEGER,
  indexed_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_meta_type_state
  ON SearchMeta(document_type, processing_state);

CREATE INDEX IF NOT EXISTS idx_search_meta_date
  ON SearchMeta(document_date DESC)
  WHERE document_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_meta_client
  ON SearchMeta(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_meta_case
  ON SearchMeta(case_id)
  WHERE case_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_meta_confidence
  ON SearchMeta(confidence DESC)
  WHERE confidence IS NOT NULL;

-- Keep SearchMeta in sync when Documents change
CREATE TRIGGER IF NOT EXISTS trg_search_meta_insert
  AFTER INSERT ON Documents BEGIN
    INSERT OR IGNORE INTO SearchMeta
      (document_id, document_type, processing_state, document_date,
       client_id, case_id, confidence, language, file_size_bytes)
    VALUES
      (NEW.id, NEW.document_type, NEW.processing_state, NEW.document_date,
       NEW.client_id, NEW.case_id, NEW.confidence, NEW.language, NEW.file_size_bytes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_search_meta_update
  AFTER UPDATE ON Documents BEGIN
    INSERT INTO SearchMeta
      (document_id, document_type, processing_state, document_date,
       client_id, case_id, confidence, language, file_size_bytes, updated_at)
    VALUES
      (NEW.id, NEW.document_type, NEW.processing_state, NEW.document_date,
       NEW.client_id, NEW.case_id, NEW.confidence, NEW.language, NEW.file_size_bytes,
       datetime('now'))
    ON CONFLICT(document_id) DO UPDATE SET
      document_type    = excluded.document_type,
      processing_state = excluded.processing_state,
      document_date    = excluded.document_date,
      client_id        = excluded.client_id,
      case_id          = excluded.case_id,
      confidence       = excluded.confidence,
      language         = excluded.language,
      file_size_bytes  = excluded.file_size_bytes,
      updated_at       = excluded.updated_at;
  END;

-- ─────────────────────────────────────────────────────────────────────────────
--  updated_at triggers for new tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_worker_health_updated_at
  AFTER UPDATE ON WorkerHealth BEGIN
    UPDATE WorkerHealth SET updated_at = datetime('now') WHERE worker_id = NEW.worker_id;
  END;
