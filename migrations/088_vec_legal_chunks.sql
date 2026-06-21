-- SKIP_ON_ERROR
-- sqlite-vec KNN virtual table for CHUNK-LEVEL case-law retrieval.
--
-- Closes audit finding A.4 #3 (verdict-level granularity). Until now case law
-- was embedded at DOCUMENT level (build-verdict-embeddings.ts truncates each
-- verdict to its first ~2,000 chars → one coarse vector per ruling). This table
-- holds one vector per LegalDocumentChunks row so a relevant passage deep inside
-- a long ruling is retrievable on its own, mirroring chunk-level client-doc
-- retrieval (vec_chunks).
--
-- SKIP_ON_ERROR: if the sqlite-vec extension is not loaded, this migration is
-- skipped gracefully and chunk search degrades to FTS5 (fts_legal_chunks) only.
-- It is retried on every startup so it activates automatically once vec0 is
-- present.
--
-- rowid == LegalDocumentChunks.id, kept in sync by
-- LegalDocumentChunkEmbeddingRepository.upsert.
-- Strictly additive. Migration slot: 088.

CREATE VIRTUAL TABLE IF NOT EXISTS vec_legal_chunks USING vec0(
  embedding float[768]
);

-- Backfill any chunk embeddings that already exist (no-op on a fresh corpus).
INSERT OR REPLACE INTO vec_legal_chunks(rowid, embedding)
SELECT id, vec_f32(embedding) FROM LegalDocumentChunks WHERE embedding IS NOT NULL;
