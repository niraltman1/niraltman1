-- Migration 019: Stens Library — interactive AI-assisted legal form templates

CREATE TABLE IF NOT EXISTS StensTemplates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he      TEXT NOT NULL,
  name_en      TEXT,
  category     TEXT NOT NULL DEFAULT 'general'
               CHECK(category IN ('civil','criminal','family','labour','administrative','traffic','general')),
  form_schema  TEXT NOT NULL,  -- JSON array of FieldDef objects
  instructions TEXT,
  legal_basis  TEXT,
  version      TEXT NOT NULL DEFAULT '1.0',
  content_hash TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS StensSubmissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id   INTEGER NOT NULL REFERENCES StensTemplates(id) ON DELETE CASCADE,
  case_id       INTEGER REFERENCES Cases(id)   ON DELETE SET NULL,
  client_id     INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  field_values  TEXT NOT NULL,  -- JSON: { fieldName: value }
  ai_filled     INTEGER NOT NULL DEFAULT 0 CHECK(ai_filled IN (0,1)),
  ai_confidence REAL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','completed','submitted')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_stens_category   ON StensTemplates(category, is_active);
CREATE INDEX IF NOT EXISTS idx_stens_sub_case   ON StensSubmissions(case_id);
CREATE INDEX IF NOT EXISTS idx_stens_sub_client ON StensSubmissions(client_id);
CREATE INDEX IF NOT EXISTS idx_stens_sub_tmpl   ON StensSubmissions(template_id);
