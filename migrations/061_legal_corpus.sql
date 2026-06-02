-- Legal Knowledge Base — verbatim, strictly per-law-isolated corpus (core KB).
--
-- DESIGN INVARIANTS (mandatory — enforced structurally):
--   1. Each law is ONE independent LegalSources row (UNIQUE source_key).
--   2. Every section belongs to EXACTLY ONE source (FK NOT NULL + ON DELETE CASCADE).
--      Sections from different laws are NEVER merged: UNIQUE(source_id, section_label),
--      and ingestion replaces a source's sections atomically (delete-then-insert).
--   3. verbatim_text_he holds the EXACT original Hebrew text — never paraphrased or
--      synthesized. (The ingester only ever slices fetched text; it never authors it.)
--   4. Embeddings carry source_id so RAG retrieval can scope to / never blend across laws.
--
-- Strictly additive.

CREATE TABLE IF NOT EXISTS LegalSources (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key       TEXT NOT NULL UNIQUE,          -- stable slug, e.g. 'penal_law_1977'
  title_he         TEXT NOT NULL,                 -- full official Hebrew title
  short_name       TEXT,                          -- e.g. 'חוק העונשין'
  citation         TEXT,                          -- canonical citation
  source_type      TEXT NOT NULL DEFAULT 'statute'
                   CHECK(source_type IN ('statute','regulation','ordinance','guideline','rules')),
  procedure_domain TEXT,                          -- 'criminal'|'civil'|... (grouping only)
  source_url       TEXT,
  year             INTEGER,
  content_hash     TEXT,                          -- sha256 of fetched verbatim text
  section_count    INTEGER NOT NULL DEFAULT 0,
  fetched_at       TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS LegalSections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id        INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
  section_label    TEXT NOT NULL,                 -- e.g. 'סעיף 199' or 'full'
  heading_he       TEXT,
  verbatim_text_he TEXT NOT NULL,                 -- EXACT original text — never paraphrased
  order_index      INTEGER NOT NULL DEFAULT 0,
  parent_label     TEXT,
  char_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_id, section_label)
);

CREATE INDEX IF NOT EXISTS idx_legal_sections_source ON LegalSections(source_id, order_index);

CREATE TABLE IF NOT EXISTS LegalSectionEmbeddings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL UNIQUE REFERENCES LegalSections(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
  embedding  TEXT NOT NULL,                       -- JSON array (mirrors ChunkEmbeddings)
  model      TEXT NOT NULL DEFAULT 'nomic-embed-text',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_emb_source ON LegalSectionEmbeddings(source_id);

-- Keyword search over verbatim sections (works without Ollama; embeddings add semantics).
CREATE VIRTUAL TABLE IF NOT EXISTS fts_legal_sections USING fts5(
  heading_he, verbatim_text_he,
  content='LegalSections', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_legal_sections_ai AFTER INSERT ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he)
  VALUES (new.id, new.heading_he, new.verbatim_text_he);
END;

CREATE TRIGGER IF NOT EXISTS trg_legal_sections_ad AFTER DELETE ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he)
  VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
END;

CREATE TRIGGER IF NOT EXISTS trg_legal_sections_au AFTER UPDATE ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he)
  VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
  INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he)
  VALUES (new.id, new.heading_he, new.verbatim_text_he);
END;
