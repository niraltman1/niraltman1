-- Migration 022: Dual-Channel Update System — tracks update history

CREATE TABLE IF NOT EXISTS UpdateLog (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  channel    TEXT NOT NULL CHECK(channel IN ('security','content')),
  version    TEXT,
  status     TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
  details    TEXT,
  error      TEXT,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_update_log_channel ON UpdateLog(channel, applied_at DESC);
