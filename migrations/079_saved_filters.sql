-- Migration 079: SavedFilters — user-defined document filter queries (Smart Collections, B2)
-- Stored as JSON filter_json: { documentType?, processingState?, caseId?, clientId? }

CREATE TABLE IF NOT EXISTS SavedFilters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he      TEXT    NOT NULL,
  filter_json  TEXT    NOT NULL DEFAULT '{}',
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
