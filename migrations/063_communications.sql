-- FACTUM-IL: Omnichannel Communication module — C0 foundation (data model + Smart Routing).
-- Strictly additive. Centralized firm-wide accounts (one official Telegram bot, one WhatsApp
-- number, …); inbound messages are routed to the correct case + assigned attorney via
-- CommContactIdentities → Clients → CaseAssignments. PRIVILEGE: outbound is consent-gated
-- (CommConsent) and fully audited (CommAudit). Message content stays local; media never leaves
-- the machine (media_ref is a local pointer). Channel secrets live in an external encrypted store
-- referenced by credential_ref — NEVER stored here.

-- ── Registered firm-wide channels (one row per channel type) ────────────────────
CREATE TABLE IF NOT EXISTS CommChannels (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  channel        TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  label          TEXT,
  status         TEXT NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('connected','disconnected','error')),
  identifier     TEXT,                    -- public handle: bot username / phone number / mailbox
  credential_ref TEXT,                    -- opaque pointer to encrypted secret store (never the secret)
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(channel)
);

-- ── Sender identity map — the key to Smart Routing ──────────────────────────────
-- Resolves an inbound channel-specific identity to a known client or contact.
CREATE TABLE IF NOT EXISTS CommContactIdentities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  external_id   TEXT NOT NULL,            -- telegram user id / E.164 phone / email address
  display_name  TEXT,
  client_id     INTEGER REFERENCES Clients(id)  ON DELETE SET NULL,
  contact_id    INTEGER REFERENCES Contacts(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(channel, external_id)
);
CREATE INDEX IF NOT EXISTS idx_comm_ident_client  ON CommContactIdentities(client_id);
CREATE INDEX IF NOT EXISTS idx_comm_ident_contact ON CommContactIdentities(contact_id);

-- ── Conversation thread, optionally bound to a client/case and routed to an attorney ──
CREATE TABLE IF NOT EXISTS CommConversations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  channel            TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  external_thread_id TEXT,                -- chat/thread id on the channel
  client_id          INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
  case_id            INTEGER REFERENCES Cases(id)   ON DELETE SET NULL,
  assigned_user_id   INTEGER REFERENCES system_users(id) ON DELETE SET NULL,  -- routed attorney (denormalized)
  subject            TEXT,
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','closed','triage')),
  last_message_at    TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(channel, external_thread_id)
);
CREATE INDEX IF NOT EXISTS idx_comm_conv_case   ON CommConversations(case_id);
CREATE INDEX IF NOT EXISTS idx_comm_conv_client ON CommConversations(client_id);
CREATE INDEX IF NOT EXISTS idx_comm_conv_user   ON CommConversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_comm_conv_status ON CommConversations(status);

-- ── Individual messages (verbatim content for evidence; minimal metadata) ───────
CREATE TABLE IF NOT EXISTS CommMessages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id     INTEGER NOT NULL REFERENCES CommConversations(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  direction           TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  external_message_id TEXT,
  sender_identity     TEXT,               -- external_id of the sender
  body                TEXT,               -- verbatim text (privilege: never logged externally)
  media_kind          TEXT,               -- null | image | audio | document | video
  media_ref           TEXT,               -- LOCAL path/id; media never leaves the machine
  handled             INTEGER NOT NULL DEFAULT 0,  -- triage: has an attorney handled this inbound?
  replied             INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_comm_msg_conv      ON CommMessages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_comm_msg_direction ON CommMessages(direction);
CREATE INDEX IF NOT EXISTS idx_comm_msg_unhandled ON CommMessages(conversation_id)
  WHERE direction = 'inbound' AND handled = 0;

-- ── Per-client, per-channel consent ledger (opt-in REQUIRED before any outbound) ──
CREATE TABLE IF NOT EXISTS CommConsent (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES Clients(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  granted     INTEGER NOT NULL DEFAULT 1,
  source      TEXT,                       -- how consent was captured (intake form / written / verbal)
  granted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at  TEXT,
  UNIQUE(client_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_comm_consent_client ON CommConsent(client_id);

-- ── Append-only audit of every outbound send + consent/routing event ────────────
CREATE TABLE IF NOT EXISTS CommAudit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES CommConversations(id) ON DELETE SET NULL,
  message_id      INTEGER REFERENCES CommMessages(id)      ON DELETE SET NULL,
  user_id         INTEGER REFERENCES system_users(id)      ON DELETE SET NULL,
  channel         TEXT NOT NULL,
  action          TEXT NOT NULL,          -- send | send_blocked | consent_grant | consent_revoke | route
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_audit_conv    ON CommAudit(conversation_id);
CREATE INDEX IF NOT EXISTS idx_comm_audit_created ON CommAudit(created_at);

-- ── Inbox for senders we couldn't resolve to a client/contact (C8 routing target) ──
CREATE TABLE IF NOT EXISTS CommUnknownInbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL CHECK (channel IN ('telegram','whatsapp','email','phone')),
  external_id   TEXT NOT NULL,
  display_name  TEXT,
  body          TEXT,
  media_kind    TEXT,
  media_ref     TEXT,
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_as   TEXT,                     -- null | client | contact
  resolved_ref  INTEGER,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_unknown_unresolved ON CommUnknownInbox(resolved)
  WHERE resolved = 0;
