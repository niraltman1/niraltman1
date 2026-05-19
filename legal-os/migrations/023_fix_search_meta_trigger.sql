-- Migration 023: Fix SearchMeta triggers
-- Bug: NEW.confidence does not exist on Documents table (column is ocr_confidence)
-- Both trg_search_meta_insert and trg_search_meta_update had this typo.

DROP TRIGGER IF EXISTS trg_search_meta_insert;
DROP TRIGGER IF EXISTS trg_search_meta_update;

CREATE TRIGGER IF NOT EXISTS trg_search_meta_insert
  AFTER INSERT ON Documents BEGIN
    INSERT OR IGNORE INTO SearchMeta
      (document_id, document_type, processing_state, document_date,
       client_id, case_id, confidence, language, file_size_bytes)
    VALUES
      (NEW.id, NEW.document_type, NEW.processing_state, NEW.document_date,
       NEW.client_id, NEW.case_id, NEW.ocr_confidence, NEW.language, NEW.file_size_bytes);
  END;

CREATE TRIGGER IF NOT EXISTS trg_search_meta_update
  AFTER UPDATE ON Documents BEGIN
    INSERT INTO SearchMeta
      (document_id, document_type, processing_state, document_date,
       client_id, case_id, confidence, language, file_size_bytes, updated_at)
    VALUES
      (NEW.id, NEW.document_type, NEW.processing_state, NEW.document_date,
       NEW.client_id, NEW.case_id, NEW.ocr_confidence, NEW.language, NEW.file_size_bytes,
       datetime('now'))
    ON CONFLICT(document_id) DO UPDATE SET
      document_type    = excluded.document_type,
      processing_state = excluded.processing_state,
      document_date    = excluded.document_date,
      client_id        = excluded.client_id,
      case_id          = excluded.case_id,
      confidence       = excluded.confidence,
      language         = excluded.language,
      file_size_bytes  = excluded.file_size_bytes,
      updated_at       = excluded.updated_at;
  END;
