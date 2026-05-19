-- Migration 026: Legal Precedent Registry + Deep Analysis Cache

CREATE TABLE IF NOT EXISTS legal_precedents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  citation      TEXT NOT NULL UNIQUE,
  case_title    TEXT,
  court_level   TEXT CHECK (court_level IN ('supreme','district','magistrate','administrative','other')),
  decision_date TEXT,
  summary_he    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_precedents_citation ON legal_precedents(citation);

CREATE TABLE IF NOT EXISTS precedent_deep_analyses (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  precedent_id         INTEGER NOT NULL REFERENCES legal_precedents(id) ON DELETE CASCADE,
  document_id          INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  legal_analogy        TEXT,
  distinguishing_risks TEXT,
  drafted_arguments    TEXT,
  model_version        TEXT NOT NULL DEFAULT 'law-il-E2B',
  confidence           REAL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pda_precedent ON precedent_deep_analyses(precedent_id);
