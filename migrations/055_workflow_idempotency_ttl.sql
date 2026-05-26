-- Add acquired_at to WorkflowIdempotencyLog so stale locks can be TTL-cleaned on startup.
-- Locks without a timestamp are treated as acquired at their processed_at time.
ALTER TABLE WorkflowIdempotencyLog ADD COLUMN acquired_at TEXT;
UPDATE WorkflowIdempotencyLog SET acquired_at = processed_at WHERE acquired_at IS NULL;
