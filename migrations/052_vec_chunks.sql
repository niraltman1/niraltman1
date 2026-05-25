-- SKIP_ON_ERROR
-- sqlite-vec virtual table for native KNN cosine similarity.
-- Requires the sqlite-vec extension to be loaded before this migration runs.
-- If the extension is absent the SKIP_ON_ERROR pragma causes the runner to
-- log a warning and retry on the next startup — the JS cosine fallback in
-- hybrid-search.ts remains active until the extension becomes available.
--
-- Dimensions: 768 (nomic-embed-text output size).

CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding float[768]
);

-- Keep vec_chunks in sync whenever a new embedding is written.
-- NEW.embedding is the JSON array string stored in ChunkEmbeddings;
-- vec_f32() converts it to the binary float32 format vec0 expects.
CREATE TRIGGER IF NOT EXISTS sync_vec_on_embed_insert
  AFTER INSERT ON ChunkEmbeddings
BEGIN
  INSERT OR REPLACE INTO vec_chunks(rowid, embedding)
  VALUES (NEW.chunk_id, vec_f32(NEW.embedding));
END;
