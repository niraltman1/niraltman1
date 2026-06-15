-- Verdict Citations — cross-corpus citation graph (Phase 12-13).
--
-- Extracted Israeli legal citations from document text. The graph is
-- corpus-agnostic: a document in one dataset may cite documents in any
-- other dataset. Never partition by dataset.
--
-- All references use LegalDocuments.document_id (FDOC-XXXXXXXX), not
-- dataset-specific IDs. Unresolved citations store only citation_text.
--
-- Strictly additive. Migration slot: 083.

CREATE TABLE IF NOT EXISTS VerdictCitations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  source_document_id  TEXT NOT NULL,   -- FDOC-XXXXXXXX of citing document
  cited_document_id   TEXT,            -- FDOC-XXXXXXXX of cited document (NULL if unresolved)
  citation_text       TEXT NOT NULL,   -- raw extracted citation string
  citation_type       TEXT,            -- 'BGTZ' | 'CA' | 'RCA' | 'TA' | 'LAB' | 'CRIM' | 'ADMIN' | 'FAMILY' | 'OTHER'
  citation_normalized TEXT,            -- normalized form (from citation-engine)
  confidence          REAL,            -- 0.0-1.0 extraction confidence
  context_snippet     TEXT,            -- surrounding text (up to 200 chars)
  is_self_cite        INTEGER NOT NULL DEFAULT 0,
  is_resolved         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_vcite_source  ON VerdictCitations(source_document_id);
CREATE INDEX IF NOT EXISTS idx_vcite_cited   ON VerdictCitations(cited_document_id) WHERE cited_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vcite_type    ON VerdictCitations(citation_type);
CREATE INDEX IF NOT EXISTS idx_vcite_resolved ON VerdictCitations(is_resolved, source_document_id);

-- ── Legal Knowledge Graph Nodes ───────────────────────────────────────────
-- Judge registry (deduplicated by normalized name)
CREATE TABLE IF NOT EXISTS LegalJudges (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he        TEXT NOT NULL UNIQUE,   -- Hebrew name (normalized)
  name_en        TEXT,
  court          TEXT,                   -- primary court affiliation
  document_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Court registry
CREATE TABLE IF NOT EXISTS LegalCourts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  court_code  TEXT NOT NULL UNIQUE,   -- e.g. 'BGTZ', 'CA', 'LABOR', 'FAMILY'
  name_he     TEXT NOT NULL,
  name_en     TEXT,
  level       INTEGER NOT NULL DEFAULT 1,  -- 1=Supreme, 2=District, 3=Magistrate, 4=Special
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Seed Israeli court hierarchy
INSERT OR IGNORE INTO LegalCourts (court_code, name_he, name_en, level) VALUES
  ('BGTZ',    'בית המשפט העליון',           'Supreme Court',         1),
  ('CA',      'בית משפט מחוזי',             'District Court',        2),
  ('LABOR',   'בית הדין לעבודה',            'Labor Court',           2),
  ('FAMILY',  'בית משפט לענייני משפחה',    'Family Court',          3),
  ('ADMIN',   'בית משפט לעניינים מנהליים',  'Administrative Court',  2),
  ('MGST',    'בית משפט שלום',             'Magistrate Court',      3),
  ('RELIGIOUS','בית דין דתי',               'Religious Court',       3);

-- Document–Judge relationship (knowledge graph DECIDED_BY)
CREATE TABLE IF NOT EXISTS LegalDocumentJudges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,   -- FDOC-XXXXXXXX
  judge_id    INTEGER NOT NULL REFERENCES LegalJudges(id) ON DELETE CASCADE,
  role        TEXT,            -- 'PRESIDING' | 'PANEL' | 'DISSENT'
  UNIQUE(document_id, judge_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_judges_doc   ON LegalDocumentJudges(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_judges_judge ON LegalDocumentJudges(judge_id);

-- Document–Party relationship (knowledge graph INVOLVES_PARTY)
CREATE TABLE IF NOT EXISTS LegalDocumentParties (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,   -- FDOC-XXXXXXXX
  party_name  TEXT NOT NULL,
  party_side  TEXT,            -- 'APPELLANT' | 'RESPONDENT' | 'PLAINTIFF' | 'DEFENDANT' | 'OTHER'
  UNIQUE(document_id, party_name)
);

CREATE INDEX IF NOT EXISTS idx_doc_parties_doc ON LegalDocumentParties(document_id);

-- Ingest validation reports
CREATE TABLE IF NOT EXISTS IngestValidationReports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     TEXT NOT NULL,
  run_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  total_rows    INTEGER NOT NULL DEFAULT 0,
  valid_rows    INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  rejection_reasons_json TEXT NOT NULL DEFAULT '{}',  -- { reason: count }
  report_path   TEXT
);

CREATE INDEX IF NOT EXISTS idx_validation_source ON IngestValidationReports(source_id, run_at DESC);
