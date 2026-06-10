-- Migration 067: AI urgency/tags on CommMessages (inbound classification, Gap #5)
-- Populated asynchronously after routing; null = classification pending or Ollama unavailable.
ALTER TABLE CommMessages ADD COLUMN ai_urgency TEXT CHECK (ai_urgency IN ('urgent','normal','low'));
ALTER TABLE CommMessages ADD COLUMN ai_tags TEXT;              -- JSON array, e.g. '["דחוף","מסמך"]'
ALTER TABLE CommMessages ADD COLUMN ai_classified_at TEXT;     -- ISO-8601, set when classification runs
