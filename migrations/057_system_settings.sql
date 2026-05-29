-- FACTUM-IL: System-wide configuration key-value store
CREATE TABLE IF NOT EXISTS SystemSettings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Default: single-user mode (any active attorney accesses all cases)
-- Switch to 'multi' to enable per-attorney CaseAssignments enforcement
INSERT OR IGNORE INTO SystemSettings (key, value) VALUES ('user_mode', 'single');
