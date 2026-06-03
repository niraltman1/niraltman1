-- FACTUM-IL: Call documentation (C6). Strictly additive.
-- Phone calls are logged events with rich metadata (no live recording — legal/ethics).
-- A call's primary home is the communications timeline (client card). It enters a case
-- timeline only when explicitly promoted via "save as evidence" (is_evidence + case_id),
-- mirroring the C5 evidence mechanism. Dictation reuses the local Whisper transcriber.

CREATE TABLE IF NOT EXISTS CallLogs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER NOT NULL REFERENCES Clients(id) ON DELETE CASCADE,
  case_id          INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  is_evidence      INTEGER NOT NULL DEFAULT 0 CHECK (is_evidence IN (0,1)),  -- promoted to case timeline
  direction        TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  subject          TEXT,
  summary          TEXT,
  occurred_at      TEXT NOT NULL,            -- ISO; defaults to now, editable (retroactive logging)
  duration_minutes INTEGER,                  -- effort/billing estimate
  participants     TEXT,                     -- JSON array of participant labels
  tags             TEXT,                     -- JSON array of tag strings
  created_by       INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_call_logs_client   ON CallLogs(client_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_case     ON CallLogs(case_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_evidence ON CallLogs(case_id, is_evidence);
