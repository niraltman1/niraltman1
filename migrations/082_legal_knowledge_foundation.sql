-- Unified Legal Knowledge Foundation
--
-- Establishes the canonical LegalDocument model, LegalSourceRegistry, and
-- LegalIngestionProgress for crash recovery. All present and future legal
-- sources (case law, legislation, regulations) normalize into LegalDocuments.
--
-- Design invariants:
--   1. Every document receives a stable FDOC-XXXXXXXX internal ID independent
--      of the originating dataset. All internal refs use document_id, not id.
--   2. source_id FK to LegalSourceRegistry isolates dataset-specific logic.
--   3. visibility_scope distinguishes public legal knowledge from private matter
--      documents: searches default to PUBLIC; private workspace docs are PRIVATE.
--   4. canonical_case_key enables cross-dataset deduplication (Phases 8, 9).
--   5. LegalIngestionProgress persists resume state for crash recovery (Phase 6).
--
-- Strictly additive. Migration slot: 082.

-- ── Source Registry ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS LegalSourceRegistry (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id         TEXT NOT NULL UNIQUE,          -- e.g. 'guychuk/case-law-israel'
  source_name       TEXT NOT NULL,                  -- human-readable display name
  source_version    TEXT,                           -- dataset version/snapshot tag
  source_license    TEXT,                           -- e.g. 'CC-BY-4.0', 'openrail'
  source_type       TEXT NOT NULL,                  -- 'CASE_LAW' | 'LEGISLATION' | 'REGULATION' | 'GUIDELINE'
  update_strategy   TEXT NOT NULL DEFAULT 'REPLACE',-- 'REPLACE' | 'MERGE' | 'APPEND'
  ingestion_adapter TEXT NOT NULL,                  -- adapter class name, e.g. 'CaseLawIsraelAdapter'
  description       TEXT,
  home_url          TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  last_ingested_at  TEXT,
  document_count    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Seed the guychuk/case-law-israel dataset as the first registered source
INSERT OR IGNORE INTO LegalSourceRegistry
  (source_id, source_name, source_version, source_license, source_type, update_strategy, ingestion_adapter, description)
VALUES
  ('guychuk/case-law-israel', 'Israeli Case Law (guychuk)', 'v1.0', 'CC-BY-4.0',
   'CASE_LAW', 'REPLACE', 'CaseLawIsraelAdapter',
   'Israeli court decisions from multiple courts including Supreme, District, Magistrate, Labor, and Family courts'),
  ('LevMuchnik/SupremeCourtOfIsrael', 'Supreme Court of Israel (LevMuchnik)', '2022', 'openrail',
   'CASE_LAW', 'REPLACE', 'LevMuchnikAdapter',
   'Israeli Supreme Court verdicts snapshot 2022'),
  ('factum-il/legislation', 'Israeli Legislation (Knesset OData)', 'live', 'open-government',
   'LEGISLATION', 'MERGE', 'KnessetLegislationAdapter',
   'Israeli statutes and regulations from Knesset OData + WikiSource');

-- ── Document ID Sequence ─────────────────────────────────────────────────
-- Monotonic counter for generating FDOC-XXXXXXXX stable IDs.
CREATE TABLE IF NOT EXISTS LegalDocumentIdSeq (
  id INTEGER PRIMARY KEY AUTOINCREMENT
);

-- ── Canonical Legal Document Model ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS LegalDocuments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id      TEXT NOT NULL UNIQUE,           -- FDOC-00000001 stable internal ID
  source_id        INTEGER NOT NULL REFERENCES LegalSourceRegistry(id) ON DELETE RESTRICT,
  source_type      TEXT NOT NULL,                   -- 'CASE_LAW' | 'LEGISLATION' | 'REGULATION'
  source_dataset   TEXT NOT NULL,                   -- denormalized source_id string for fast queries
  source_version   TEXT,                            -- dataset snapshot/version
  document_type    TEXT NOT NULL,                   -- 'VERDICT' | 'DECISION' | 'ORDER' | 'STATUTE' | 'REGULATION'
  proceeding_type  TEXT,                            -- 'CIVIL' | 'CRIMINAL' | 'LABOR' | 'FAMILY' | 'ADMINISTRATIVE'
  court            TEXT,
  case_number      TEXT,
  title            TEXT,
  date             TEXT,                            -- ISO date (YYYY-MM-DD)
  year             INTEGER,
  judges_json      TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
  parties_json     TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
  lawyers_json     TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
  text             TEXT NOT NULL,                   -- verbatim document text
  char_count       INTEGER NOT NULL DEFAULT 0,
  metadata_json    TEXT NOT NULL DEFAULT '{}',      -- extracted metadata (domain, keywords, outcome, etc.)
  visibility_scope TEXT NOT NULL DEFAULT 'PUBLIC',  -- 'PUBLIC' | 'PRIVATE' | 'SHARED'
  canonical_case_key TEXT,                          -- normalized dedup key (court+case_number)
  duplicate_of_id  INTEGER REFERENCES LegalDocuments(id),
  duplicate_count  INTEGER NOT NULL DEFAULT 0,
  external_id      TEXT,                            -- original dataset ID (e.g. judgment_id)
  content_hash     TEXT,                            -- SHA-256 of text for dedup
  is_active        INTEGER NOT NULL DEFAULT 1,
  indexed_at       TEXT,                            -- when FTS/vector indexing completed
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_docs_source      ON LegalDocuments(source_id, is_active);
CREATE INDEX IF NOT EXISTS idx_legal_docs_court       ON LegalDocuments(court, year);
CREATE INDEX IF NOT EXISTS idx_legal_docs_case_number ON LegalDocuments(case_number);
CREATE INDEX IF NOT EXISTS idx_legal_docs_date        ON LegalDocuments(date DESC);
CREATE INDEX IF NOT EXISTS idx_legal_docs_scope       ON LegalDocuments(visibility_scope, is_active);
CREATE INDEX IF NOT EXISTS idx_legal_docs_dedup       ON LegalDocuments(canonical_case_key) WHERE canonical_case_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_docs_hash        ON LegalDocuments(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_docs_type        ON LegalDocuments(document_type, proceeding_type);
CREATE INDEX IF NOT EXISTS idx_legal_docs_source_ds   ON LegalDocuments(source_dataset, is_active);

-- FTS5 unified search over all legal documents
CREATE VIRTUAL TABLE IF NOT EXISTS fts_legal_documents USING fts5(
  title, case_number, court, text,
  content='LegalDocuments', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_legal_docs_ai AFTER INSERT ON LegalDocuments BEGIN
  INSERT INTO fts_legal_documents(rowid, title, case_number, court, text)
  VALUES (new.id, new.title, new.case_number, new.court, new.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_legal_docs_ad AFTER DELETE ON LegalDocuments BEGIN
  INSERT INTO fts_legal_documents(fts_legal_documents, rowid, title, case_number, court, text)
  VALUES ('delete', old.id, old.title, old.case_number, old.court, old.text);
END;

CREATE TRIGGER IF NOT EXISTS trg_legal_docs_au AFTER UPDATE ON LegalDocuments BEGIN
  INSERT INTO fts_legal_documents(fts_legal_documents, rowid, title, case_number, court, text)
  VALUES ('delete', old.id, old.title, old.case_number, old.court, old.text);
  INSERT INTO fts_legal_documents(rowid, title, case_number, court, text)
  VALUES (new.id, new.title, new.case_number, new.court, new.text);
END;

-- ── Ingestion Progress (crash recovery) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS LegalIngestionProgress (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL UNIQUE,       -- matches LegalSourceRegistry.source_id
  status         TEXT NOT NULL DEFAULT 'IDLE', -- 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED'
  last_batch     INTEGER NOT NULL DEFAULT 0,
  last_line      INTEGER NOT NULL DEFAULT 0,
  total_lines    INTEGER,
  processed      INTEGER NOT NULL DEFAULT 0,
  rejected       INTEGER NOT NULL DEFAULT 0,
  duplicates     INTEGER NOT NULL DEFAULT 0,
  elapsed_ms     INTEGER NOT NULL DEFAULT 0,
  error_message  TEXT,
  started_at     TEXT,
  completed_at   TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ── Corpus Version History ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS CorpusVersionHistory (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id      TEXT NOT NULL,
  corpus_version TEXT NOT NULL,
  corpus_sha256  TEXT NOT NULL,
  document_count INTEGER NOT NULL DEFAULT 0,
  artifact_path  TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_corpus_version_source ON CorpusVersionHistory(source_id, created_at DESC);

-- Seed corpus versioning settings
INSERT OR IGNORE INTO SystemSettings (key, value) VALUES ('verdict_corpus_version', 'unset');
INSERT OR IGNORE INTO SystemSettings (key, value) VALUES ('verdict_corpus_sha256', '');
INSERT OR IGNORE INTO SystemSettings (key, value) VALUES ('legal_knowledge_version', '1.0.0');
