-- FACTUM-IL: Communication smart templates (C4) — context-aware message templates +
-- secure local links for send-to-sign / upload. Strictly additive.
-- Templates carry {{placeholders}} resolved from the case/client at render time.
-- Matching is by Case Type × Case Status × Channel (NULL column = wildcard "any").
-- Secrets/links: CommSecureLinks issues a tokenised LOCAL URL (the document/page is served
-- locally — nothing leaves the machine); links are single-purpose and expirable.

CREATE TABLE IF NOT EXISTS CommTemplates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_he       TEXT NOT NULL,
  body          TEXT NOT NULL,                 -- contains {{placeholders}}
  channel       TEXT CHECK (channel IN ('telegram','whatsapp','email','phone')),  -- NULL = any
  case_type     TEXT,                          -- NULL = any (matches Cases.case_type)
  case_status   TEXT,                          -- NULL = any (matches Cases.status: open/closed/…)
  client_status TEXT CHECK (client_status IN ('active','inactive')),              -- NULL = any
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_tpl_match   ON CommTemplates(case_type, case_status);
CREATE INDEX IF NOT EXISTS idx_comm_tpl_active  ON CommTemplates(is_active);

CREATE TABLE IF NOT EXISTS CommSecureLinks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT NOT NULL UNIQUE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('sign','upload','view')),
  case_id     INTEGER REFERENCES Cases(id)     ON DELETE CASCADE,
  document_id INTEGER REFERENCES Documents(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES system_users(id) ON DELETE SET NULL,
  expires_at  TEXT,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_link_token ON CommSecureLinks(token);
CREATE INDEX IF NOT EXISTS idx_comm_link_case  ON CommSecureLinks(case_id);

-- Seed a small set of Hebrew templates (idempotent on name_he).
INSERT INTO CommTemplates (name_he, body, channel, case_type, case_status, client_status)
SELECT * FROM (
  SELECT 'תזכורת דיון' AS name_he,
         'שלום {{client_name}}, נזכיר כי נקבע דיון בתיק {{case_number}} בתאריך {{next_hearing}} ב{{court_name}}. נא להיערך בהתאם.' AS body,
         NULL AS channel, NULL AS case_type, 'open' AS case_status, NULL AS client_status
  UNION ALL SELECT 'בקשת מסמכים',
         'שלום {{client_name}}, לצורך הטיפול בתיק {{case_number}} נא להעלות את המסמכים בקישור המאובטח: {{upload_link}}',
         NULL, NULL, 'open', NULL
  UNION ALL SELECT 'החתמה על מסמך',
         '{{client_name}} שלום, נא לחתום על המסמך בקישור המאובטח: {{sign_link}}',
         NULL, NULL, NULL, NULL
  UNION ALL SELECT 'פתיחת תיק — ברוכים הבאים',
         '{{client_name}} שלום, תיק {{case_number}} נפתח במשרדנו. לתקשורת מאובטחת ומהירה ניתן להשיב להודעה זו. בכבוד, {{firm_name}}.',
         NULL, NULL, 'open', NULL
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM CommTemplates t WHERE t.name_he = seed.name_he);
