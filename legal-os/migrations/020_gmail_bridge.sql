-- Migration 020: Gmail/OAuth Bridge — optional email ingest module

CREATE TABLE IF NOT EXISTS GmailSyncConfig (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_address   TEXT NOT NULL,
  label_filter    TEXT NOT NULL DEFAULT 'Factum IL',
  encrypted_token TEXT NOT NULL,
  token_iv        TEXT NOT NULL,
  token_tag       TEXT NOT NULL,
  last_sync_at    TEXT,
  last_message_id TEXT,
  is_enabled      INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS GmailSyncLog (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id       INTEGER NOT NULL REFERENCES GmailSyncConfig(id) ON DELETE CASCADE,
  synced_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  messages_found       INTEGER NOT NULL DEFAULT 0,
  attachments_ingested INTEGER NOT NULL DEFAULT 0,
  errors_count         INTEGER NOT NULL DEFAULT 0,
  error_summary        TEXT
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_log_config ON GmailSyncLog(sync_config_id, synced_at DESC);
