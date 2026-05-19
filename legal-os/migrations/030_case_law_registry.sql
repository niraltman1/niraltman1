-- Migration 030: Global Case Law Registry + 3-Step Relevance Tests
-- global_case_law: firm-wide precedent archive (uploaded, harvested, or manual)
-- case_law_relevance_tests: AI-evaluated 3-step test results per case

CREATE TABLE IF NOT EXISTS global_case_law (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  citation      TEXT NOT NULL UNIQUE,
  case_title    TEXT,
  court_level   TEXT CHECK (court_level IN ('supreme','district','magistrate','administrative','other')),
  decision_date TEXT,
  governing_law TEXT,
  offense_clause TEXT,
  summary_he    TEXT,
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('uploaded','harvested','manual')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_case_law_citation ON global_case_law(citation);
CREATE INDEX IF NOT EXISTS idx_case_law_source   ON global_case_law(source);

CREATE TABLE IF NOT EXISTS case_law_relevance_tests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  case_law_id    INTEGER NOT NULL REFERENCES global_case_law(id) ON DELETE CASCADE,
  case_id        INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  step1_passed   INTEGER NOT NULL DEFAULT 0,
  step2_passed   INTEGER NOT NULL DEFAULT 0,
  step3_passed   INTEGER NOT NULL DEFAULT 0,
  steps_passed   INTEGER NOT NULL DEFAULT 0,
  step1_reason   TEXT,
  step2_reason   TEXT,
  step3_reason   TEXT,
  citation_string TEXT,
  model_version  TEXT NOT NULL DEFAULT 'law-il-E2B',
  tested_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_clrt_case_law ON case_law_relevance_tests(case_law_id);
CREATE INDEX IF NOT EXISTS idx_clrt_case     ON case_law_relevance_tests(case_id);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (30, '030_case_law_registry', 'sha256-placeholder-030');
