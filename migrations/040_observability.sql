-- Migration 040: observability metrics store
CREATE TABLE Metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT NOT NULL,
  agent       TEXT NOT NULL,
  document_id INTEGER,
  tags        TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_metrics_name_time ON Metrics(name, recorded_at);
CREATE INDEX idx_metrics_agent ON Metrics(agent);
