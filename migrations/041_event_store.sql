-- Migration 041: domain event store
CREATE TABLE EventStore (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id    TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_event_store_kind ON EventStore(kind);
CREATE INDEX idx_event_store_occurred ON EventStore(occurred_at);

CREATE TABLE EventHandlerLog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id    TEXT NOT NULL,
  handler_id  TEXT NOT NULL,
  handled_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(trace_id, handler_id)
);

CREATE TABLE DeadLetterQueue (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id       TEXT NOT NULL,
  kind           TEXT NOT NULL,
  payload        TEXT NOT NULL,
  failure_reason TEXT NOT NULL,
  retry_count    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
