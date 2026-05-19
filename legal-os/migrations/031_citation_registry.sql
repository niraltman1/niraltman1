-- Migration 031: Citation Registry (Adversarial Citation Harvester)
-- Tracks Israeli case law citations extracted from opponent pleadings and
-- historical firm documents. Links to global_case_law when resolved.

CREATE TABLE IF NOT EXISTS citation_registry (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  citation             TEXT NOT NULL,
  context_snippet      TEXT,
  source_document_id   INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  case_id              INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  inferred_relevance   TEXT,
  resolved_case_law_id INTEGER REFERENCES global_case_law(id) ON DELETE SET NULL,
  status               TEXT NOT NULL DEFAULT 'unresolved'
                       CHECK (status IN ('unresolved','linked','archived')),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_citation_case   ON citation_registry(case_id);
CREATE INDEX IF NOT EXISTS idx_citation_status ON citation_registry(status);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (31, '031_citation_registry', 'sha256-placeholder-031');
