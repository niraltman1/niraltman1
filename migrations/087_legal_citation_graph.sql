-- Legal Citation Graph — models how judgments treat one another.
--
-- The retrieval layer previously ranked precedents on semantic similarity alone.
-- This table captures legal-authority relationships so a frequently *followed*
-- Supreme Court precedent can outrank an isolated precedent of equal similarity,
-- and an *overruled* precedent can be demoted.
--
-- document ids are LegalDocuments.document_id (TEXT, FDOC-XXXXXXXX). They are not
-- declared as hard FKs because edges may be ingested before both endpoints exist
-- (incremental corpus loading); orphan edges are simply ignored by joins.
--
-- citation_type taxonomy (Israeli appellate treatment language):
--   cites        — neutral reference
--   followed     — positive: applied the precedent's ratio
--   applied      — positive
--   approved     — positive
--   distinguished— negative: limited to its facts
--   criticized   — negative
--   overruled    — negative: precedent no longer good law
--
-- Strictly additive. Migration slot: 087.

CREATE TABLE IF NOT EXISTS LegalCitationGraph (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  source_document_id TEXT NOT NULL,
  target_document_id TEXT NOT NULL,
  citation_type      TEXT NOT NULL DEFAULT 'cites'
    CHECK (citation_type IN
      ('cites','followed','applied','approved','distinguished','criticized','overruled')),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_document_id, target_document_id, citation_type)
);

CREATE INDEX IF NOT EXISTS idx_lcg_target ON LegalCitationGraph(target_document_id);
CREATE INDEX IF NOT EXISTS idx_lcg_source ON LegalCitationGraph(source_document_id);
CREATE INDEX IF NOT EXISTS idx_lcg_type   ON LegalCitationGraph(citation_type);
