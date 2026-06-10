-- FACTUM-IL: Time Entries (רישומי זמן) — first slice of §4.1.5 Billing/Time-tracking.
-- Tracks billable hours per case as a foundation for invoicing (TimeEntries → Invoices later).

CREATE TABLE IF NOT EXISTS TimeEntries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id        INTEGER NOT NULL REFERENCES Cases(id) ON DELETE CASCADE,
  description_he TEXT    NOT NULL,
  entry_date     TEXT    NOT NULL,
  hours          REAL    NOT NULL CHECK(hours > 0),
  rate           REAL    NOT NULL DEFAULT 0 CHECK(rate >= 0),
  billable       INTEGER NOT NULL DEFAULT 1 CHECK(billable IN (0,1)),
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_case ON TimeEntries(case_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON TimeEntries(entry_date);
