-- Migration 039: Add registry_status to Cases
--
-- Tracks whether a case identifier was found in the Legal_Registry (mapped)
-- or requires manual classification (manual_review_required).
-- Populated at CSV import time by net-hamishpat-parser.ts via legal-registry-loader.ts.

ALTER TABLE Cases ADD COLUMN registry_status TEXT
  CHECK(registry_status IN ('mapped','manual_review_required'));

CREATE INDEX IF NOT EXISTS idx_cases_registry_status ON Cases(registry_status);

-- Back-fill: cases already classified (procedure_type not null) are presumed mapped.
UPDATE Cases
   SET registry_status = 'mapped'
 WHERE procedure_type IS NOT NULL
   AND registry_status IS NULL;
