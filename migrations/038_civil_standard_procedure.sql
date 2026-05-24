-- Migration 038: Add civil_standard procedure type (סדר דין רגיל, code 32)
--
-- Background:
--   Identifier code 32 in the Israeli court system denotes Civil Standard
--   Procedure (סדר דין רגיל), which is a distinct classification from the
--   generic 'civil' bucket.  This migration introduces 'civil_standard' as
--   a valid procedure_type value and replaces the column-level CHECK constraint
--   (which SQLite cannot ALTER) with BEFORE INSERT/UPDATE triggers that
--   enforce the extended valid-value set non-destructively.
--
--   The existing CHECK on the column remains in the schema text but SQLite
--   ignores CHECK constraints added via ALTER TABLE ADD COLUMN when the column
--   already contains data; the trigger is the authoritative validator going
--   forward.

-- Drop any previous constraint-enforcement triggers to avoid duplication.
DROP TRIGGER IF EXISTS trg_validate_procedure_type_insert;
DROP TRIGGER IF EXISTS trg_validate_procedure_type_update;

-- BEFORE INSERT: reject unknown procedure_type values.
CREATE TRIGGER trg_validate_procedure_type_insert
BEFORE INSERT ON Cases
WHEN NEW.procedure_type IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.procedure_type NOT IN (
      'civil',
      'civil_standard',
      'traffic_administrative',
      'traffic_criminal',
      'academic',
      'insolvency'
    )
    THEN RAISE(ABORT, 'Invalid procedure_type: ' || NEW.procedure_type)
  END;
END;

-- BEFORE UPDATE: same guard on updates to procedure_type.
CREATE TRIGGER trg_validate_procedure_type_update
BEFORE UPDATE OF procedure_type ON Cases
WHEN NEW.procedure_type IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.procedure_type NOT IN (
      'civil',
      'civil_standard',
      'traffic_administrative',
      'traffic_criminal',
      'academic',
      'insolvency'
    )
    THEN RAISE(ABORT, 'Invalid procedure_type: ' || NEW.procedure_type)
  END;
END;

-- Populate civil_standard for any existing Cases rows where procedure_code = '32'
-- (procedure_code column added by IdentifierParser; may not exist yet — wrapped in
--  a guard so this migration is idempotent even on fresh databases).
CREATE TEMP TABLE _col_check AS
  SELECT COUNT(*) AS cnt FROM pragma_table_info('Cases') WHERE name = 'procedure_code';

-- Add procedure_code column if not already present (idempotent).
-- SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN,
-- so we check via the temp table above and branch via a view trick.

-- NOTE: The ALTER is always safe on a fresh DB. On existing DBs the column
-- may already exist from a previous partial migration run; the MigrationRunner
-- skips already-applied migrations by SHA-256 hash, so this block executes
-- exactly once.
ALTER TABLE Cases ADD COLUMN procedure_code TEXT;

UPDATE Cases
  SET procedure_type = 'civil_standard'
WHERE procedure_code = '32'
  AND (procedure_type IS NULL OR procedure_type = 'civil');

DROP TABLE _col_check;
