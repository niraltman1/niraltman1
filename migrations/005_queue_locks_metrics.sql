-- Migration 005: Persistent processing queue, distributed locks, metrics
-- These tables form the backbone of Phase 2's production hardening.

-- ─────────────────────────────────────────────
--  Persistent Processing Queue
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ProcessingQueue (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          TEXT    NOT NULL UNIQUE,          -- UUID for this queue item
  document_id      INTEGER REFERENCES Documents(id) ON DELETE CASCADE,
  file_hash        TEXT    NOT NULL,
  original_path    TEXT    NOT NULL,
  current_state    TEXT    NOT NULL DEFAULT 'DISCOVERED'
                   CHECK (current_state IN (
                     'DISCOVERED','HASHED','OCR_PENDING','OCR_COMPLETE',
                     'CLASSIFIED','ENRICHED','REVIEW_PENDING','APPLIED',
                     'VERIFIED','FAILED','ROLLED_BACK'
                   )),
  target_state     TEXT    NOT NULL,
  priority         INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  retry_count      INTEGER NOT NULL DEFAULT 0,
  max_retries      INTEGER NOT NULL DEFAULT 3,
  next_retry_at    TEXT,                              -- ISO-8601; NULL = ready immediately
  worker_id        TEXT,                              -- which worker holds this item
  locked_at        TEXT,                              -- when the worker acquired it
  lock_expires_at  TEXT,                              -- auto-release time
  is_poisoned      INTEGER NOT NULL DEFAULT 0 CHECK (is_poisoned IN (0,1)),
  poison_reason    TEXT,
  processing_start TEXT,
  processing_end   TEXT,
  error_message    TEXT,
  manifest_ref     TEXT,                              -- snapshot_id of pre-processing snapshot
  metadata_json    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_queue_current_state   ON ProcessingQueue(current_state);
CREATE INDEX IF NOT EXISTS idx_queue_is_poisoned     ON ProcessingQueue(is_poisoned);
CREATE INDEX IF NOT EXISTS idx_queue_worker_id       ON ProcessingQueue(worker_id);
CREATE INDEX IF NOT EXISTS idx_queue_next_retry_at   ON ProcessingQueue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_queue_priority        ON ProcessingQueue(priority DESC);
CREATE INDEX IF NOT EXISTS idx_queue_document_id     ON ProcessingQueue(document_id);
CREATE INDEX IF NOT EXISTS idx_queue_file_hash       ON ProcessingQueue(file_hash);
CREATE INDEX IF NOT EXISTS idx_queue_lock_expires_at ON ProcessingQueue(lock_expires_at);

-- ─────────────────────────────────────────────
--  Distributed Locks
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Locks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_key TEXT    NOT NULL UNIQUE,   -- e.g. "file:sha256hash" or "migration:runner"
  owner_id     TEXT    NOT NULL,           -- UUID of the lock holder
  owner_type   TEXT    NOT NULL,           -- worker / migration / ocr / manifest
  acquired_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at   TEXT    NOT NULL,           -- mandatory expiry – no infinite locks
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_locks_resource_key ON Locks(resource_key);
CREATE INDEX IF NOT EXISTS idx_locks_expires_at   ON Locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_locks_owner_id     ON Locks(owner_id);

-- ─────────────────────────────────────────────
--  Observability Metrics
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Metrics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_name  TEXT    NOT NULL,
  metric_value REAL    NOT NULL,
  unit         TEXT    NOT NULL DEFAULT 'ms',
  agent        TEXT    NOT NULL,
  document_id  INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  tags_json    TEXT,
  recorded_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_metric_name ON Metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded_at ON Metrics(recorded_at);
CREATE INDEX IF NOT EXISTS idx_metrics_agent       ON Metrics(agent);

-- ─────────────────────────────────────────────
--  OCR Cache
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS OCRCache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash       TEXT    NOT NULL UNIQUE,
  ocr_text        TEXT    NOT NULL,
  page_count      INTEGER,
  confidence      REAL,
  language        TEXT    NOT NULL DEFAULT 'he',
  tesseract_ver   TEXT,
  processing_ms   INTEGER,
  cached_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_ocrcache_file_hash ON OCRCache(file_hash);

-- ─────────────────────────────────────────────
--  Manifest Transaction Journal
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS TransactionJournal (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id  TEXT    NOT NULL UNIQUE,            -- UUID
  document_id     INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  phase           TEXT    NOT NULL,                   -- BEGIN / COMMIT / ROLLBACK / INTERRUPTED
  operation_type  TEXT    NOT NULL,
  agent           TEXT    NOT NULL,
  state_before    TEXT    NOT NULL,                   -- JSON snapshot
  state_after     TEXT,                               -- NULL until COMMIT
  file_hash_before TEXT,
  file_hash_after  TEXT,
  path_before     TEXT,
  path_after      TEXT,
  interrupted     INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0,1)),
  replayed        INTEGER NOT NULL DEFAULT 0 CHECK (replayed IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  committed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_transaction_id ON TransactionJournal(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_interrupted    ON TransactionJournal(interrupted);
CREATE INDEX IF NOT EXISTS idx_journal_document_id    ON TransactionJournal(document_id);

-- Updated_at triggers for new tables
CREATE TRIGGER IF NOT EXISTS trg_queue_updated_at
  AFTER UPDATE ON ProcessingQueue BEGIN
    UPDATE ProcessingQueue SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = new.id;
  END;

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (5, '005_queue_locks_metrics', 'sha256-placeholder-005');
