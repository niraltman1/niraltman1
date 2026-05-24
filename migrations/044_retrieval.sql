CREATE TABLE IF NOT EXISTS DocumentChunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  char_start  INTEGER NOT NULL DEFAULT 0,
  char_end    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON DocumentChunks(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_document_chunks USING fts5(
  chunk_text,
  content='DocumentChunks',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 1'
);

CREATE TABLE IF NOT EXISTS ChunkEmbeddings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id   INTEGER NOT NULL UNIQUE REFERENCES DocumentChunks(id) ON DELETE CASCADE,
  embedding  TEXT NOT NULL,
  model      TEXT NOT NULL DEFAULT 'nomic-embed-text',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
