-- SKIP_ON_ERROR
-- sqlite-vec KNN virtual table for semantic search (Phases 14-15).
--
-- This migration is SKIP_ON_ERROR: if the sqlite-vec extension is not loaded,
-- the migration is skipped gracefully and the system falls back to JS cosine
-- similarity over LegalDocumentEmbeddings. The migration is retried on every
-- startup so it will activate automatically once the extension is available.
--
-- Strictly additive. Migration slot: 085.

CREATE VIRTUAL TABLE IF NOT EXISTS vec_legal_documents USING vec0(
  embedding float[768]
);
