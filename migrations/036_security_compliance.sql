-- Migration 036: Security, Privacy & Regulatory Compliance (GDPR + Israeli Privacy Protection Amendment 13)

-- Local system users for RBAC (admin/attorney/assistant/reviewer/read_only)
CREATE TABLE system_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'assistant'
                CHECK (role IN ('admin','attorney','assistant','reviewer','read_only')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Bearer token sessions (SHA-256 of token stored — never raw token)
CREATE TABLE user_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_token   ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- Immutable audit event log (no UPDATE or DELETE should ever touch this table)
CREATE TABLE audit_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL
                CHECK (event_type IN ('read','create','update','delete','export','ai_query','login','logout','erasure','session_expire')),
  actor_id      INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  actor_role    TEXT,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  action_detail TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  severity      TEXT NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info','warn','critical')),
  logged_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_actor    ON audit_events(actor_id);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_logged   ON audit_events(logged_at);
CREATE INDEX idx_audit_type     ON audit_events(event_type);

-- Configurable retention policies (TTL-based auto-purge)
CREATE TABLE retention_policies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL UNIQUE,
  ttl_days      INTEGER NOT NULL,
  legal_hold    INTEGER NOT NULL DEFAULT 0,
  action        TEXT NOT NULL DEFAULT 'anonymize'
                CHECK (action IN ('delete','anonymize','archive')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO retention_policies (resource_type, ttl_days, action) VALUES
  ('ocr_text',        2555, 'anonymize'),
  ('audit_events',    2555, 'archive'),
  ('temp_files',         7, 'delete'),
  ('completed_cases', 2555, 'archive');

-- GDPR Article 17 erasure requests
CREATE TABLE erasure_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_name  TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     INTEGER NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','completed','rejected')),
  legal_hold      INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  completed_at    TEXT,
  completed_by    INTEGER REFERENCES system_users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Encrypted field storage (column-level AES-256-GCM for PII)
CREATE TABLE encrypted_fields (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name     TEXT NOT NULL,
  row_id         INTEGER NOT NULL,
  field_name     TEXT NOT NULL,
  ciphertext     TEXT NOT NULL,
  iv             TEXT NOT NULL,
  tag            TEXT NOT NULL,
  key_derivation TEXT NOT NULL DEFAULT 'env',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(table_name, row_id, field_name)
);
CREATE INDEX idx_ef_lookup ON encrypted_fields(table_name, row_id);

-- Data classification on sensitive tables
ALTER TABLE Documents ADD COLUMN sensitivity TEXT DEFAULT 'internal'
  CHECK (sensitivity IN ('public','internal','confidential','privileged','highly_sensitive'));
ALTER TABLE Clients   ADD COLUMN data_classification TEXT DEFAULT 'confidential'
  CHECK (data_classification IN ('public','internal','confidential','privileged','highly_sensitive'));
ALTER TABLE Cases     ADD COLUMN data_classification TEXT DEFAULT 'confidential'
  CHECK (data_classification IN ('public','internal','confidential','privileged','highly_sensitive'));

-- PII encryption flags on Clients
ALTER TABLE Clients ADD COLUMN id_number_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Clients ADD COLUMN phone_encrypted      INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (36, '036_security_compliance', 'sha256-placeholder-036');
