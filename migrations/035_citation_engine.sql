-- Migration 035: Citation Engine — structured fields for citation_registry and global_case_law

-- Add structured citation fields to citation_registry
ALTER TABLE citation_registry ADD COLUMN citation_type    TEXT;
ALTER TABLE citation_registry ADD COLUMN confidence_score REAL;
ALTER TABLE citation_registry ADD COLUMN canonical_form   TEXT;
ALTER TABLE citation_registry ADD COLUMN structured_json  TEXT;

-- Add canonical citation to global_case_law
ALTER TABLE global_case_law ADD COLUMN canonical_citation TEXT;

CREATE INDEX IF NOT EXISTS idx_cr_type       ON citation_registry(citation_type);
CREATE INDEX IF NOT EXISTS idx_cr_confidence ON citation_registry(confidence_score);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (35, '035_citation_engine', 'sha256-placeholder-035');
