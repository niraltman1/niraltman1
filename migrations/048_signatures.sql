CREATE TABLE IF NOT EXISTS DocumentSignatures (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id    INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
  signer_id      INTEGER NOT NULL REFERENCES system_users(id),
  signer_name    TEXT NOT NULL,
  document_hash  TEXT NOT NULL,
  signature_hash TEXT NOT NULL,
  status         TEXT NOT NULL CHECK(status IN ('pending','signed','rejected')) DEFAULT 'pending',
  notes          TEXT,
  signed_at      TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(document_id, signer_id)
);
CREATE INDEX IF NOT EXISTS idx_sigs_document ON DocumentSignatures(document_id);
CREATE INDEX IF NOT EXISTS idx_sigs_signer ON DocumentSignatures(signer_id);
