-- Migration 010: Legal Engine — Regulation Templates & Procedural Skeletons
-- Stores AI-learned procedural frameworks per case type.
-- Enables the "Learning Loop": one-time human-in-the-loop teaches the system,
-- every future case of that type is automatically scaffolded.

CREATE TABLE IF NOT EXISTS RegulationTemplates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_type    TEXT NOT NULL,           -- maps to CaseType enum OR custom string
  name_he      TEXT NOT NULL,           -- e.g. "סדר הדין הפלילי"
  name_en      TEXT,
  legal_basis  TEXT,                    -- e.g. "חוק סדר הדין הפלילי תשמ"ב-1982"
  source_url   TEXT,                    -- optional link to regulation
  source_text  TEXT,                    -- pasted regulation text fed to Ollama
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK(status IN ('draft','active','deprecated')),
  ai_generated INTEGER NOT NULL DEFAULT 0,
  approved_at  TEXT,                    -- set when user approves the skeleton
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_case_type_active
  ON RegulationTemplates(case_type) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_templates_status ON RegulationTemplates(status);

-- ─── Milestones (the procedural steps inside a template) ──────────────────────

CREATE TABLE IF NOT EXISTS TemplateMilestones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id    INTEGER NOT NULL REFERENCES RegulationTemplates(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL,
  title_he       TEXT NOT NULL,
  title_en       TEXT,
  description    TEXT,
  -- day_offset: days after the anchor event.
  -- NULL means "date determined by court order".
  day_offset     INTEGER,
  -- anchor: what day_offset is relative to.
  --   'filing'       = case.opened_date
  --   'previous'     = previous milestone's due_date
  --   'court_order'  = manually entered by user
  anchor         TEXT NOT NULL DEFAULT 'filing'
                 CHECK(anchor IN ('filing','previous','court_order')),
  is_mandatory   INTEGER NOT NULL DEFAULT 1,
  task_priority  TEXT NOT NULL DEFAULT 'normal'
                 CHECK(task_priority IN ('low','normal','high','critical')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_milestones_template ON TemplateMilestones(template_id, sequence_order);

-- ─── Case Procedures (links a case to its applied template + anchor) ──────────

CREATE TABLE IF NOT EXISTS CaseProcedures (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER NOT NULL UNIQUE REFERENCES Cases(id) ON DELETE CASCADE,
  template_id  INTEGER NOT NULL REFERENCES RegulationTemplates(id),
  anchor_date  TEXT NOT NULL,   -- "day 0" for this case (usually opened_date)
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK(status IN ('active','completed','suspended')),
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
