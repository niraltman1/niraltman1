CREATE TABLE IF NOT EXISTS Entities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  canonical   TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',
  case_id     INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  document_id INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(kind, canonical)
);
CREATE INDEX IF NOT EXISTS idx_entities_kind ON Entities(kind);
CREATE INDEX IF NOT EXISTS idx_entities_case ON Entities(case_id);

CREATE TABLE IF NOT EXISTS EntityRelations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id     INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(from_id, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_entity_relations_from ON EntityRelations(from_id);
CREATE INDEX IF NOT EXISTS idx_entity_relations_to   ON EntityRelations(to_id);
