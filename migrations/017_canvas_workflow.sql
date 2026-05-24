-- Migration 017: Canvas/Workflow — court receipt and signed PDF detection columns on Documents

ALTER TABLE Documents ADD COLUMN is_court_receipt          INTEGER NOT NULL DEFAULT 0 CHECK(is_court_receipt IN (0,1));
ALTER TABLE Documents ADD COLUMN is_signed_pdf             INTEGER NOT NULL DEFAULT 0 CHECK(is_signed_pdf IN (0,1));
ALTER TABLE Documents ADD COLUMN court_receipt_detected_at TEXT;

CREATE INDEX IF NOT EXISTS idx_docs_court_receipt ON Documents(is_court_receipt)
  WHERE is_court_receipt = 1;
