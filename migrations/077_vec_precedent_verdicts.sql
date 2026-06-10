-- SKIP_ON_ERROR
-- sqlite-vec virtual table for native KNN cosine similarity over Supreme Court
-- verdict-level embeddings (Phase 3, Tier 1 — companion to 070/071).
--
-- Requires the sqlite-vec extension to be loaded before this migration runs.
-- If the extension is absent, SKIP_ON_ERROR causes the runner to log a warning
-- and retry on the next startup (same pattern as 052_vec_chunks.sql).
--
-- Embedding granularity: ONE vector per verdict (rowid == SupremeCourtVerdicts.id),
-- loaded directly from the pre-computed "embedding" field in factum_il_mvp.jsonl —
-- the ingestion script does NOT re-embed. Validated against a real sample record:
-- 768 dimensions, all-numeric float array — matches the column definition below.
CREATE VIRTUAL TABLE IF NOT EXISTS vec_precedent_verdicts USING vec0(
  embedding float[768]
);
