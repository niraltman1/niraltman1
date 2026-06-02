-- Verdict Corpus — verbatim Israeli court-ruling KB (case law / פסיקה).
--
-- DISTINCT from `global_case_law` (migration 030): that table is a small, curated,
-- firm-wide PRECEDENT REGISTRY (citation + summary + AI 3-step relevance tests). THIS
-- table is the bulk, verbatim full-text VERDICT CORPUS used for keyword/semantic
-- retrieval (the "Authorities" reasoning step), ingested from public open datasets
-- (e.g. the 2022 snapshot of the Supreme Court of Israel public verdicts and decisions).
--
-- DESIGN INVARIANTS (mandatory):
--   1. Each ruling document is ONE VerdictCorpus row, keyed by a stable doc_key (the
--      dataset's per-document hash). Re-ingestion is idempotent — never duplicated.
--   2. verbatim_text_he holds the EXACT ruling text — never paraphrased or synthesized.
--      The ingester only ever copies dataset text; it never authors legal content.
--   3. Provenance & staleness are first-class: source_dataset and snapshot_label are
--      NOT NULL, so every row self-documents its origin and that it is a point-in-time
--      snapshot — NOT the live/current court record.
--   4. Embeddings carry verdict_id so RAG retrieval scopes cleanly to a single ruling.
--
-- Strictly additive.

CREATE TABLE IF NOT EXISTS VerdictCorpus (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_key          TEXT NOT NULL UNIQUE,          -- stable dataset doc hash (idempotency key)
  case_number      TEXT,                          -- e.g. 'בג"ץ 5856/03'
  case_name        TEXT,                          -- e.g. 'יורם יזדי נ. פרקליטות המדינה'
  court            TEXT,                          -- e.g. 'בג"ץ' (meta_court_nm)
  verdict_type     TEXT,                          -- e.g. 'פסק-דין' | 'החלטה' (Type)
  verdict_date     TEXT,                          -- ISO date (VerdictDt)
  year             INTEGER,
  judges_json      TEXT NOT NULL DEFAULT '[]',    -- JSON array of judge names
  parties_json     TEXT NOT NULL DEFAULT '[]',    -- JSON array of side names
  lawyers_json     TEXT NOT NULL DEFAULT '[]',    -- JSON array of lawyer names
  verbatim_text_he TEXT NOT NULL,                 -- EXACT ruling text — never paraphrased
  char_count       INTEGER NOT NULL DEFAULT 0,
  source_dataset   TEXT NOT NULL,                 -- e.g. 'LevMuchnik/SupremeCourtOfIsrael'
  snapshot_label   TEXT NOT NULL,                 -- e.g. '2022' — point-in-time, NOT live
  source_license   TEXT,                          -- e.g. 'openrail'
  fetched_at       TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_verdict_corpus_court   ON VerdictCorpus(court, year);
CREATE INDEX IF NOT EXISTS idx_verdict_corpus_casenum ON VerdictCorpus(case_number);

CREATE TABLE IF NOT EXISTS VerdictCorpusEmbeddings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  verdict_id INTEGER NOT NULL UNIQUE REFERENCES VerdictCorpus(id) ON DELETE CASCADE,
  embedding  TEXT NOT NULL,                       -- JSON array (mirrors ChunkEmbeddings)
  model      TEXT NOT NULL DEFAULT 'nomic-embed-text',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_verdict_emb_verdict ON VerdictCorpusEmbeddings(verdict_id);

-- Keyword search over verbatim rulings (works without Ollama; embeddings add semantics).
CREATE VIRTUAL TABLE IF NOT EXISTS fts_verdict_corpus USING fts5(
  case_name, case_number, verbatim_text_he,
  content='VerdictCorpus', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_verdict_corpus_ai AFTER INSERT ON VerdictCorpus BEGIN
  INSERT INTO fts_verdict_corpus(rowid, case_name, case_number, verbatim_text_he)
  VALUES (new.id, new.case_name, new.case_number, new.verbatim_text_he);
END;

CREATE TRIGGER IF NOT EXISTS trg_verdict_corpus_ad AFTER DELETE ON VerdictCorpus BEGIN
  INSERT INTO fts_verdict_corpus(fts_verdict_corpus, rowid, case_name, case_number, verbatim_text_he)
  VALUES ('delete', old.id, old.case_name, old.case_number, old.verbatim_text_he);
END;

CREATE TRIGGER IF NOT EXISTS trg_verdict_corpus_au AFTER UPDATE ON VerdictCorpus BEGIN
  INSERT INTO fts_verdict_corpus(fts_verdict_corpus, rowid, case_name, case_number, verbatim_text_he)
  VALUES ('delete', old.id, old.case_name, old.case_number, old.verbatim_text_he);
  INSERT INTO fts_verdict_corpus(rowid, case_name, case_number, verbatim_text_he)
  VALUES (new.id, new.case_name, new.case_number, new.verbatim_text_he);
END;
