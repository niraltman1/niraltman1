-- Migration 006: Search ranking cache and AI prompt versioning

-- ─────────────────────────────────────────────
--  Search Ranking Cache
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS SearchRankingCache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash      TEXT    NOT NULL,
  query_text      TEXT    NOT NULL,
  result_ids_json TEXT    NOT NULL,         -- ordered array of document IDs
  total_hits      INTEGER NOT NULL,
  search_type     TEXT    NOT NULL DEFAULT 'fts5',
  cached_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_cache_query_hash  ON SearchRankingCache(query_hash);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at  ON SearchRankingCache(expires_at);

-- ─────────────────────────────────────────────
--  AI Prompt Versions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS AIPromptVersions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_key      TEXT    NOT NULL,           -- logical name e.g. "classify_document"
  version         INTEGER NOT NULL,
  prompt_template TEXT    NOT NULL,
  prompt_hash     TEXT    NOT NULL UNIQUE,    -- SHA-256 of template content
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promptver_key_version ON AIPromptVersions(prompt_key, version);
CREATE INDEX IF NOT EXISTS idx_promptver_active ON AIPromptVersions(prompt_key, is_active);

-- ─────────────────────────────────────────────
--  AI Audit Log (response checksums, isolation records)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS AIAuditLog (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  enrichment_id    INTEGER REFERENCES AIEnrichment(id) ON DELETE SET NULL,
  document_id      INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  prompt_key       TEXT    NOT NULL,
  prompt_version   INTEGER NOT NULL,
  prompt_hash      TEXT    NOT NULL,
  response_hash    TEXT    NOT NULL,            -- SHA-256 of raw response
  isolation_key    TEXT    NOT NULL,            -- client_id:case_id scope
  hallucination_flags TEXT,                     -- JSON array of flagged fields
  regex_overrides  TEXT,                        -- JSON array of fields where regex won
  confidence       REAL,
  duration_ms      INTEGER,
  model_name       TEXT    NOT NULL,
  logged_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_aiaudit_document_id   ON AIAuditLog(document_id);
CREATE INDEX IF NOT EXISTS idx_aiaudit_prompt_hash   ON AIAuditLog(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_aiaudit_logged_at     ON AIAuditLog(logged_at);

-- ─────────────────────────────────────────────
--  WAL Checkpoint History
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS WALCheckpoints (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mode          TEXT    NOT NULL CHECK (mode IN ('PASSIVE','FULL','RESTART','TRUNCATE')),
  pages_written INTEGER,
  pages_moved   INTEGER,
  triggered_by  TEXT    NOT NULL,
  duration_ms   INTEGER,
  checkpointed_at TEXT  NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (6, '006_search_ai_hardening', 'sha256-placeholder-006');
