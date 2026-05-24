-- Migration 012: Traffic Case Lifecycle & Risk Auditor
--
-- Implements the "Guard Dog" — tracks the 365-day statute of limitations
-- from police ingestion date, detects rejection keywords in scanned PDFs,
-- and drives the state machine: Request → Police Ingestion → Summons/Closure.

CREATE TABLE IF NOT EXISTS TrafficCases (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id               INTEGER NOT NULL UNIQUE REFERENCES Cases(id) ON DELETE CASCADE,

  -- State machine
  lifecycle_state       TEXT    NOT NULL DEFAULT 'request_to_stand_trial'
                        CHECK (lifecycle_state IN (
                          'request_to_stand_trial',  -- בקשה לעמוד לדין הוגשה
                          'police_ingestion',         -- התקבלה אצל המשטרה
                          'summons_issued',           -- הזמנה / כתב אישום ניתנה
                          'closed',                   -- תיק נסגר
                          'statute_lapsed'            -- התיישנות — שנה חלפה ללא הזמנה
                        )),

  -- Key dates
  request_date          TEXT,    -- date request was filed
  ingestion_date        TEXT,    -- date police acknowledged (starts 365-day clock)
  summons_date          TEXT,    -- date summons/indictment was issued
  closed_date           TEXT,

  -- Statute of limitations
  statute_deadline      TEXT     -- computed: ingestion_date + 365 days (ISO-8601)
                        GENERATED ALWAYS AS (
                          CASE
                            WHEN ingestion_date IS NOT NULL
                            THEN datetime(ingestion_date, '+365 days')
                            ELSE NULL
                          END
                        ) STORED,

  -- Rejection detection
  rejection_detected    INTEGER NOT NULL DEFAULT 0 CHECK (rejection_detected IN (0,1)),
  rejection_keywords    TEXT,    -- JSON array of matched keywords
  rejection_excerpt     TEXT,    -- surrounding text context
  rejection_document_id INTEGER REFERENCES Documents(id) ON DELETE SET NULL,

  -- Reference numbers
  police_file_number    TEXT,    -- מספר תיק משטרתי
  prosecution_entity    TEXT,    -- גוף תביעה (e.g. פרקליטות, שוטר)
  offense_description   TEXT,    -- תיאור העבירה

  notes                 TEXT,

  created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_case_id        ON TrafficCases(case_id);
CREATE INDEX IF NOT EXISTS idx_traffic_state          ON TrafficCases(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_traffic_deadline       ON TrafficCases(statute_deadline);
CREATE INDEX IF NOT EXISTS idx_traffic_rejection      ON TrafficCases(rejection_detected);
