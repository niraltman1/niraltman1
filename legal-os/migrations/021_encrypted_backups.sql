-- Migration 021: Encrypted backup metadata
ALTER TABLE BackupSnapshots ADD COLUMN is_encrypted  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE BackupSnapshots ADD COLUMN encryption_iv  TEXT;
ALTER TABLE BackupSnapshots ADD COLUMN encryption_tag TEXT;
ALTER TABLE BackupSnapshots ADD COLUMN key_derivation TEXT;
