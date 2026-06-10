-- FACTUM-IL: Supreme Court precedent corpus — chunked text + FTS5 index (Phase 3, Tier 1).
-- Companion to 070_supreme_court_verdicts.sql. Vector storage lives in a separate
-- migration (072_vec_precedent_verdicts.sql) since it requires the sqlite-vec
-- extension and is marked SKIP_ON_ERROR — this migration must always succeed cleanly.
--
-- NOTE on embedding granularity: the MVP dataset provides one 768-dim embedding per
-- VERDICT (not per chunk). PrecedentChunks therefore holds chunk text for full-text
-- (BM25/FTS5) retrieval only — no per-chunk vector column. See 072 for the
-- verdict-level vector index.

CREATE TABLE IF NOT EXISTS PrecedentChunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  verdict_id  INTEGER NOT NULL REFERENCES SupremeCourtVerdicts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  char_start  INTEGER,
  char_end    INTEGER,
  UNIQUE(verdict_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_precedent_chunks_verdict ON PrecedentChunks(verdict_id);

-- Full-text search over chunk text (BM25 / FTS5).
CREATE VIRTUAL TABLE IF NOT EXISTS fts_precedent_chunks USING fts5(
  chunk_text,
  content='PrecedentChunks',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_fts_precedent_chunks_insert
  AFTER INSERT ON PrecedentChunks BEGIN
    INSERT INTO fts_precedent_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_precedent_chunks_update
  AFTER UPDATE OF chunk_text ON PrecedentChunks BEGIN
    INSERT INTO fts_precedent_chunks(fts_precedent_chunks, rowid, chunk_text)
      VALUES ('delete', old.id, old.chunk_text);
    INSERT INTO fts_precedent_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
  END;

CREATE TRIGGER IF NOT EXISTS trg_fts_precedent_chunks_delete
  BEFORE DELETE ON PrecedentChunks BEGIN
    INSERT INTO fts_precedent_chunks(fts_precedent_chunks, rowid, chunk_text)
      VALUES ('delete', old.id, old.chunk_text);
  END;
