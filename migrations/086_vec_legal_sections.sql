-- SKIP_ON_ERROR
-- sqlite-vec KNN virtual table for the legislation KB (LegalSections).
--
-- Closes the worst retrieval bottleneck in the audit: searchLegalSections()
-- previously loaded EVERY LegalSectionEmbeddings row into memory and ran a JS
-- cosine loop (O(n)) on every query. With this table the legal-section search
-- gains a native sqlite-vec KNN path, mirroring vec_chunks / vec_legal_documents.
--
-- SKIP_ON_ERROR: if the sqlite-vec extension is not loaded, this migration is
-- skipped gracefully and the system keeps using the JS-cosine fallback. It is
-- retried on every startup so it activates automatically once vec0 is present.
--
-- rowid == LegalSections.id, kept in sync by LegalCorpusRepository.upsertEmbedding.
-- Strictly additive. Migration slot: 086.

CREATE VIRTUAL TABLE IF NOT EXISTS vec_legal_sections USING vec0(
  embedding float[768]
);

-- Backfill any embeddings that already exist (no-op on a fresh corpus).
INSERT OR REPLACE INTO vec_legal_sections(rowid, embedding)
SELECT section_id, vec_f32(embedding) FROM LegalSectionEmbeddings;
