-- Migration 028: Court Hearings (iCal Calendar Target)
-- Stores hearing events parsed from official court .ics calendar exports.
-- Cross-matched against active Cases by case_number.

CREATE TABLE IF NOT EXISTS court_hearings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
  case_number  TEXT,
  hearing_date TEXT NOT NULL,
  hearing_time TEXT,
  courtroom    TEXT,
  judge_name   TEXT,
  hearing_type TEXT,
  ical_uid     TEXT UNIQUE,
  raw_summary  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_hearings_case ON court_hearings(case_id);
CREATE INDEX IF NOT EXISTS idx_hearings_date ON court_hearings(hearing_date);

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (28, '028_court_hearings', 'sha256-placeholder-028');
