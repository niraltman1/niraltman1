-- Migration 054: SystemEvents table
-- Stores startup diagnostics, crash events, and recovery sessions
-- for visibility in the dashboard and support bundles.
-- Written by: support-diagnostics package + DiagnosticsService (C#)
-- Read by: /api/recovery/events and /api/diagnostics/status

CREATE TABLE IF NOT EXISTS SystemEvents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    TEXT    NOT NULL UNIQUE,          -- UUID
  occurred_at TEXT    NOT NULL,                 -- ISO8601
  event_type  TEXT    NOT NULL,                 -- 'startup'|'crash'|'recovery_opened'|'recovery_continued'|'recovery_exit'|'safe_mode_start'
  source      TEXT    NOT NULL DEFAULT 'api',   -- 'api'|'desktop'|'installer'
  severity    TEXT    NOT NULL DEFAULT 'info',  -- 'info'|'warn'|'critical'
  message     TEXT    NOT NULL DEFAULT '',
  details     TEXT    NOT NULL DEFAULT '{}'     -- JSON blob (redacted)
);

CREATE INDEX IF NOT EXISTS idx_system_events_type      ON SystemEvents(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_occurred  ON SystemEvents(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity  ON SystemEvents(severity);
