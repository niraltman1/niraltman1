-- Migration 068: Legal Drafting Workspace
-- Tables: LegalDrafts, DraftVersions, DraftCitations, EvidenceShelf

CREATE TABLE IF NOT EXISTS LegalDrafts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL DEFAULT 'טיוטה חדשה',
  content_json     TEXT,
  content_html     TEXT,
  matter_id        INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  client_id        INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  document_type    TEXT    NOT NULL DEFAULT 'general'
                           CHECK(document_type IN ('motion','brief','letter','contract','opinion','general')),
  status           TEXT    NOT NULL DEFAULT 'draft'
                           CHECK(status IN ('draft','review','final','archived')),
  word_count       INTEGER NOT NULL DEFAULT 0,
  parent_draft_id  INTEGER REFERENCES LegalDrafts(id) ON DELETE SET NULL,
  fork_reason      TEXT,
  created_by       TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS DraftVersions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id         INTEGER NOT NULL REFERENCES LegalDrafts(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  content_json     TEXT    NOT NULL,
  content_html     TEXT,
  word_count       INTEGER NOT NULL DEFAULT 0,
  change_reason    TEXT,
  is_ai_generated  INTEGER NOT NULL DEFAULT 0 CHECK(is_ai_generated IN (0,1)),
  ai_operation     TEXT,
  created_by       TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(draft_id, version_number)
);

CREATE TABLE IF NOT EXISTS DraftCitations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id     INTEGER NOT NULL REFERENCES LegalDrafts(id) ON DELETE CASCADE,
  citation_ref TEXT    NOT NULL,
  entity_type  TEXT    NOT NULL DEFAULT 'case_law'
               CHECK(entity_type IN ('case_law','legislation','regulation','precedent','internal')),
  entity_id    INTEGER,
  node_id      TEXT,
  inserted_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS EvidenceShelf (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id     INTEGER NOT NULL REFERENCES LegalDrafts(id) ON DELETE CASCADE,
  shelf_type   TEXT    NOT NULL CHECK(shelf_type IN ('case','legislation','precedent','note','ai_output','excerpt','document')),
  title        TEXT    NOT NULL,
  content_he   TEXT,
  source_ref   TEXT,
  entity_id    INTEGER,
  entity_type  TEXT,
  is_inserted  INTEGER NOT NULL DEFAULT 0 CHECK(is_inserted IN (0,1)),
  inserted_at  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_legal_drafts_matter    ON LegalDrafts(matter_id);
CREATE INDEX IF NOT EXISTS idx_legal_drafts_client    ON LegalDrafts(client_id);
CREATE INDEX IF NOT EXISTS idx_legal_drafts_status    ON LegalDrafts(status);
CREATE INDEX IF NOT EXISTS idx_legal_drafts_parent    ON LegalDrafts(parent_draft_id);
CREATE INDEX IF NOT EXISTS idx_legal_drafts_active    ON LegalDrafts(is_active);
CREATE INDEX IF NOT EXISTS idx_draft_versions_draft   ON DraftVersions(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_citations_draft  ON DraftCitations(draft_id);
CREATE INDEX IF NOT EXISTS idx_evidence_shelf_draft   ON EvidenceShelf(draft_id);
