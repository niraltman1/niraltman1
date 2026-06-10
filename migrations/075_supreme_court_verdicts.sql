-- FACTUM-IL: Supreme Court precedent corpus — verdict metadata (Phase 3, Tier 1).
-- Populated by packages/legal-corpus-ingest from the factum_il_mvp.jsonl MVP dataset
-- (20K Supreme Court decisions with pre-computed 768-dim embeddings, generated via
-- a GitHub Action — full text + verdict-level embedding, NOT per-chunk).
--
-- Source record shape (validated against a 4-record sample of the real file):
--   { id: "ע\"א 248/97",       -- raw citation string (NOT a numeric id — stored as citation_raw)
--     case_name, court, case_type, date,
--     judges: "['אהרן ברק' 'אליהו מצא']",  -- Python-repr-like string, NOT valid JSON —
--                                             ingestion re-parses with a regex and re-serializes
--                                             as a proper JSON array into judges_json
--     text, embedding: float[768] }         -- one embedding PER VERDICT (document-level)

CREATE TABLE IF NOT EXISTS SupremeCourtVerdicts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  hf_doc_hash     TEXT NOT NULL UNIQUE,   -- content hash of (citation_raw + text) — true de-dup key,
                                          -- since citation_raw is not guaranteed unique pre-normalization
  citation_raw    TEXT NOT NULL,          -- verbatim "id" field from the source JSONL, e.g. 'ע"א 248/97'
  citation        TEXT,                   -- normalized via parseCitation()/canonicalizeCitation()
  case_name       TEXT NOT NULL,
  court           TEXT,                   -- e.g. 'בית המשפט העליון'
  case_type       TEXT,                   -- e.g. 'ע"א', 'בג"ץ'
  verdict_dt      TEXT,                   -- ISO date, e.g. '1997-03-20'
  year            INTEGER,                -- derived from verdict_dt for fast filtering
  judges_json     TEXT,                   -- JSON array of judge names (re-serialized at ingest)
  summary_he      TEXT,                   -- first ~600 chars of verdict text, for list/preview display
  embedding_done  INTEGER NOT NULL DEFAULT 0,  -- 0=pending, 1=loaded into vec_precedent_verdicts
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_scv_year       ON SupremeCourtVerdicts(year);
CREATE INDEX IF NOT EXISTS idx_scv_citation   ON SupremeCourtVerdicts(citation);
CREATE INDEX IF NOT EXISTS idx_scv_embed_done ON SupremeCourtVerdicts(embedding_done);
