-- Legal Document Embeddings — unified semantic search infrastructure (Phases 14-15).
--
-- All public legal documents participate in a SINGLE retrieval layer. No
-- separate embedding indexes per corpus. Semantic search spans all public
-- sources simultaneously.
--
-- Uses sqlite-vec (SKIP_ON_ERROR so startup never blocks if extension absent).
-- Falls back to cosine similarity in JS when vec0 unavailable.
--
-- Strictly additive. Migration slot: 084.

-- Embedding metadata table (always created — no SKIP_ON_ERROR needed)
CREATE TABLE IF NOT EXISTS LegalDocumentEmbeddings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,    -- FDOC-XXXXXXXX
  model       TEXT NOT NULL DEFAULT 'nomic-embed-text',
  embedding   TEXT NOT NULL,           -- JSON float[] stored as text (fallback when vec0 unavailable)
  dim         INTEGER NOT NULL DEFAULT 768,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_emb_doc ON LegalDocumentEmbeddings(document_id);

-- Native sqlite-vec KNN table (SKIP_ON_ERROR — sqlite-vec extension may not be loaded)
-- When available, provides sub-millisecond approximate nearest-neighbor search.
-- SKIP_ON_ERROR
CREATE VIRTUAL TABLE IF NOT EXISTS vec_legal_documents USING vec0(
  embedding float[768]
);

-- Chunked text for legal documents (for RAG — long documents need chunking)
CREATE TABLE IF NOT EXISTS LegalDocumentChunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,   -- FDOC-XXXXXXXX
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  char_count  INTEGER NOT NULL DEFAULT 0,
  embedding   TEXT,            -- JSON float[] (null until embedded)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_legal_chunks_doc ON LegalDocumentChunks(document_id);

-- FTS5 over chunks for hybrid search
CREATE VIRTUAL TABLE IF NOT EXISTS fts_legal_chunks USING fts5(
  chunk_text,
  content='LegalDocumentChunks', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_legal_chunks_ai AFTER INSERT ON LegalDocumentChunks BEGIN
  INSERT INTO fts_legal_chunks(rowid, chunk_text) VALUES (new.id, new.chunk_text);
END;

CREATE TRIGGER IF NOT EXISTS trg_legal_chunks_ad AFTER DELETE ON LegalDocumentChunks BEGIN
  INSERT INTO fts_legal_chunks(fts_legal_chunks, rowid, chunk_text)
  VALUES ('delete', old.id, old.chunk_text);
END;

-- Benchmark telemetry
CREATE TABLE IF NOT EXISTS LegalCorpusBenchmark (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source_id           TEXT NOT NULL,
  total_documents     INTEGER NOT NULL DEFAULT 0,
  import_duration_ms  INTEGER NOT NULL DEFAULT 0,
  peak_memory_kb      INTEGER,
  db_size_bytes       INTEGER,
  fts_size_bytes      INTEGER,
  embedding_size_bytes INTEGER,
  avg_search_ms       REAL,
  avg_semantic_ms     REAL,
  notes               TEXT
);
