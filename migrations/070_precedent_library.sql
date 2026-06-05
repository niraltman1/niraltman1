-- FACTUM-IL: Verdict / Judgment Library (ספריית פסקי דין).
-- Stores OCR'd court verdicts from staging folders as standalone reference documents.
-- Each row points to a Documents row (document_type='precedent') and carries
-- LLM-extracted legal metadata used to build rich RAG context for the main enrichment worker.

CREATE TABLE IF NOT EXISTS PrecedentDocuments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id       INTEGER NOT NULL UNIQUE REFERENCES Documents(id) ON DELETE CASCADE,
  source_path       TEXT NOT NULL,
  original_filename TEXT NOT NULL,

  -- Metadata extracted by law-il-E2B after OCR:
  procedure_type    TEXT,   -- civil | criminal | traffic_criminal | traffic_administrative | labor | family | administrative | other
  legal_domain      TEXT,   -- Hebrew legal domain, e.g. 'חוזים', 'נזיקין', 'דיני עבודה'
  legal_questions   TEXT,   -- JSON array of strings: legal questions decided in this verdict
  factual_summary   TEXT,   -- paragraph: factual background in Hebrew
  keywords          TEXT,   -- JSON array of strings: key legal terms

  ingested_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_precedent_documents_doc    ON PrecedentDocuments(document_id);
CREATE INDEX IF NOT EXISTS idx_precedent_documents_domain ON PrecedentDocuments(legal_domain);
CREATE INDEX IF NOT EXISTS idx_precedent_documents_proc   ON PrecedentDocuments(procedure_type);

-- FTS5 sync triggers for DocumentChunks (missing from migration 044).
-- Without these, fts_document_chunks never gets populated and hybrid FTS search returns nothing.
CREATE TRIGGER IF NOT EXISTS trg_fts_chunks_insert
  AFTER INSERT ON DocumentChunks BEGIN
    INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_chunks_update
  AFTER UPDATE OF chunk_text ON DocumentChunks BEGIN
    INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text)
      VALUES ('delete', old.id, old.chunk_text);
    INSERT INTO fts_document_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_chunks_delete
  BEFORE DELETE ON DocumentChunks BEGIN
    INSERT INTO fts_document_chunks(fts_document_chunks, rowid, chunk_text)
      VALUES ('delete', old.id, old.chunk_text);
  END;

-- Backfill: index any chunks already in DocumentChunks that are not yet in the FTS table.
INSERT INTO fts_document_chunks(rowid, chunk_text)
  SELECT dc.id, dc.chunk_text
  FROM DocumentChunks dc
  WHERE NOT EXISTS (
    SELECT 1 FROM fts_document_chunks fts WHERE fts.rowid = dc.id
  );
