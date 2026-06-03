-- FACTUM-IL: Communication evidence + transcription (C5). Strictly additive.
-- CommEvidence is the message-as-exhibit counterpart to the file-based EvidenceLocker:
-- a write-protected, content-hashed snapshot of a specific message, bound to a case for
-- chain-of-custody. Whisper transcripts are stored on the message (LOCAL transcription only —
-- audio never leaves the machine; this is a speech-to-text utility, NOT the legal AI model).

ALTER TABLE CommMessages ADD COLUMN transcript TEXT;

CREATE TABLE IF NOT EXISTS CommEvidence (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id         INTEGER NOT NULL REFERENCES CommMessages(id)      ON DELETE CASCADE,
  conversation_id    INTEGER REFERENCES CommConversations(id)          ON DELETE SET NULL,
  case_id            INTEGER REFERENCES Cases(id)                       ON DELETE SET NULL,
  client_id          INTEGER REFERENCES Clients(id)                    ON DELETE SET NULL,
  channel            TEXT NOT NULL,
  direction          TEXT,
  sender_identity    TEXT,
  body               TEXT,                 -- verbatim snapshot at capture time
  media_kind         TEXT,
  media_ref          TEXT,
  content_hash       TEXT NOT NULL,        -- sha256 of the verbatim snapshot (integrity / custody)
  message_created_at TEXT,                 -- original message timestamp (provenance)
  captured_by        INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  is_locked          INTEGER NOT NULL DEFAULT 1 CHECK (is_locked IN (0,1)),  -- write-protected exhibit
  captured_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(message_id)                       -- one exhibit per message
);
CREATE INDEX IF NOT EXISTS idx_comm_evidence_case   ON CommEvidence(case_id);
CREATE INDEX IF NOT EXISTS idx_comm_evidence_client ON CommEvidence(client_id);
