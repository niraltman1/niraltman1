-- Migration 027: Decoupled Client Payment Schedules (Manual Retriever Ledger)
-- Entirely separate from case litigation workflows — no automated state switches.

CREATE TABLE IF NOT EXISTS client_payment_schedules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER NOT NULL REFERENCES Clients(id) ON DELETE CASCADE,
  description_he TEXT    NOT NULL,
  total_amount   REAL    NOT NULL DEFAULT 0,
  paid_amount    REAL    NOT NULL DEFAULT 0,
  due_date       TEXT    NOT NULL,
  payment_status TEXT    NOT NULL DEFAULT 'PENDING'
                 CHECK (payment_status IN ('PENDING','PAID','OVERDUE')),
  invoice_number TEXT,
  receipt_number TEXT,
  morning_doc_url TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_cps_client ON client_payment_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_cps_status ON client_payment_schedules(payment_status);
CREATE INDEX IF NOT EXISTS idx_cps_due    ON client_payment_schedules(due_date);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (27, '027_payment_ledger', 'sha256-placeholder-027');
