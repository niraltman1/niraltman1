-- Migration 014: Extend Cases with AI-enriched fields + Documents ai_enriched flag
-- These columns are added safely with ALTER TABLE (idempotent via IF NOT EXISTS guard on SQLite 3.37+)

ALTER TABLE Cases ADD COLUMN judge_name       TEXT;
ALTER TABLE Cases ADD COLUMN procedure_type   TEXT DEFAULT 'civil'
  CHECK(procedure_type IN ('civil','traffic_administrative','traffic_criminal','academic'));
ALTER TABLE Cases ADD COLUMN statute_deadline TEXT; -- ISO 8601 date for 365-day admin track

ALTER TABLE Documents ADD COLUMN ai_enriched  INTEGER NOT NULL DEFAULT 0;
