-- Migration 081: Phase 4 Patch Delivery System — structured audit tables

-- PatchApplicationLog: immutable record of every .factumpatch application attempt.
-- UpdateLog (migration 022) tracks software installer updates via channels.
-- This table tracks the separate .factumpatch incremental-patch workflow introduced
-- in Phase 4, with enough detail to reconstruct the patch timeline for compliance.
CREATE TABLE IF NOT EXISTS PatchApplicationLog (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  patch_id         TEXT    NOT NULL,          -- manifest targetVersion or unique patch id
  patch_version    TEXT    NOT NULL,          -- targetVersion from PatchManifest
  from_version     TEXT    NOT NULL,          -- installed version before apply
  signing_key_id   TEXT    NOT NULL,          -- signingKeyId from PatchManifest
  status           TEXT    NOT NULL
                   CHECK(status IN ('applied','failed','rolled_back')),
  failure_reason   TEXT,                      -- non-null on status='failed'/'rolled_back'
  recovery_point_id TEXT,                     -- id of RecoveryPoint created for this apply
  actor_id         INTEGER,                   -- system_users.id of admin who triggered apply
  duration_ms      INTEGER,                   -- total PatchManager pipeline duration
  applied_at       TEXT    NOT NULL
                   DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_pal_status     ON PatchApplicationLog(status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_patch_id   ON PatchApplicationLog(patch_id);
CREATE INDEX IF NOT EXISTS idx_pal_actor      ON PatchApplicationLog(actor_id);

-- SupportExportLog: tracks every support bundle export for attorney-client privilege
-- compliance. Does NOT store document content — only metadata about the export itself.
CREATE TABLE IF NOT EXISTS SupportExportLog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  export_id      TEXT    NOT NULL UNIQUE,     -- uuid assigned to the bundle
  actor_id       INTEGER,                     -- system_users.id who initiated export
  actor_role     TEXT,
  bundle_size_mb REAL,                        -- serialised bundle size in MB
  sections       TEXT,                        -- JSON array of included section names
  excluded       TEXT,                        -- JSON array of excluded sections (size cap)
  status         TEXT    NOT NULL
                 CHECK(status IN ('completed','aborted','failed')),
  error_message  TEXT,
  exported_at    TEXT    NOT NULL
                 DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_sel_actor   ON SupportExportLog(actor_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_sel_status  ON SupportExportLog(status);
