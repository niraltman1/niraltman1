-- Rules_Engine — Israeli procedural rules registry (§4.7.1).
--
-- BACKGROUND: migration 046 (ProceduralChecklist.rule_id) declares a foreign key
-- REFERENCES Rules_Engine(id), and litigation-intelligence/completeness.ts
-- (seedProceduralChecklist) already SELECTs from this table — but the table was
-- never created. This migration creates it and seeds a starter rule set so the
-- consumer no longer queries a missing table, and so procedural deadlines live in
-- the database (per the project rule "do not hardcode deadline logic — always read
-- from the database") rather than in code.
--
-- ⚠️ LEGAL REVIEW REQUIRED: the seeded deadlines below are a first draft grounded in
-- the cited statutes. They MUST be reviewed by an Israeli attorney before any
-- production reliance. Where a deadline is uncertain it is left NULL with guidance in
-- the description rather than asserting a possibly-wrong number. Deadlines are stored
-- as data precisely so they can be corrected here without code changes.
--
-- Strictly additive.

CREATE TABLE IF NOT EXISTS Rules_Engine (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name        TEXT    NOT NULL,
  procedure_type   TEXT    NOT NULL,
  description      TEXT,
  deadline_days    INTEGER,            -- days from the trigger event; NULL when court-set or uncertain
  deadline_basis   TEXT,               -- the event the deadline is counted from
  source_reference TEXT,               -- statutory / regulatory citation
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(procedure_type, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_rules_procedure ON Rules_Engine(procedure_type, sort_order);

INSERT OR IGNORE INTO Rules_Engine
  (rule_name, procedure_type, description, deadline_days, deadline_basis, source_reference, sort_order)
VALUES
  -- civil — תקנות סדר הדין האזרחי, התשע"ט–2018
  ('הגשת כתב הגנה', 'civil', 'הנתבע מגיש כתב הגנה בתוך 60 ימים ממסירת כתב התביעה.', 60, 'המצאת כתב התביעה', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 1),
  ('הגשת תצהירי עדות ראשית', 'civil', 'מועד נקבע בהחלטת בית המשפט בקדם המשפט.', NULL, 'החלטת בית המשפט', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 2),
  ('הגשת סיכומים בכתב', 'civil', 'מועד נקבע בהחלטת בית המשפט בתום שמיעת הראיות.', NULL, 'החלטת בית המשפט', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 3),
  ('בקשה לביטול פסק דין שניתן בהיעדר הגנה', 'civil', 'בקשה לביטול פסק דין שניתן במעמד צד אחד.', 30, 'המצאת פסק הדין', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 4),
  ('בקשה לתיקון כתב טענות', 'civil', 'בקשה לתיקון כתב טענות; המועד נקבע בהחלטת בית המשפט.', NULL, 'החלטת בית המשפט', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 5),

  -- civil_appeal — ערעור אזרחי
  ('ערעור בזכות על פסק דין אזרחי', 'civil_appeal', 'ערעור בזכות לערכאת הערעור על פסק דין אזרחי.', 60, 'מתן פסק הדין', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 1),
  ('בקשת רשות ערעור על החלטה אחרת', 'civil_appeal', 'בקשת רשות ערעור על "החלטה אחרת" שאינה פסק דין.', 30, 'מתן ההחלטה', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 2),

  -- criminal — חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982
  ('ערעור על הכרעת דין וגזר דין', 'criminal', 'ערעור פלילי על הכרעת הדין וגזר הדין.', 45, 'מתן פסק הדין', 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982, סעיף 199', 1),
  ('הגשת רשימת עדים וחומר חקירה', 'criminal', 'העמדת חומר החקירה לעיון ההגנה; מועד לפי דין והחלטת בית המשפט.', NULL, 'כתב האישום / החלטת בית המשפט', 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982', 2),

  -- family — בית המשפט לענייני משפחה
  ('הגשת כתב הגנה בתביעת משפחה', 'family', 'כתב הגנה בתביעה בבית המשפט לענייני משפחה.', 60, 'המצאת כתב התביעה', 'תקנות סדר הדין האזרחי, התשע"ט–2018', 1),
  ('בקשה ליישוב סכסוך (עיכוב הליכים)', 'family', 'תקופת עיכוב הליכים לאחר הגשת בקשה ליישוב סכסוך; לאימות מול הדין.', NULL, 'הגשת בקשה ליישוב סכסוך', 'חוק להסדר התדיינויות בסכסוכי משפחה, התשע"ה–2014', 2),

  -- labor — בית הדין לעבודה
  ('הגשת כתב הגנה בבית הדין לעבודה', 'labor', 'כתב הגנה בתביעה בבית הדין האזורי לעבודה.', 30, 'המצאת כתב התביעה', 'תקנות בית הדין לעבודה (סדרי דין), התשנ"ב–1991', 1),
  ('ערעור לבית הדין הארצי לעבודה', 'labor', 'ערעור על פסק דין של בית דין אזורי לעבודה.', 30, 'מתן פסק הדין', 'חוק בית הדין לעבודה, התשכ"ט–1969', 2),

  -- administrative — בתי משפט לעניינים מינהליים
  ('הגשת עתירה מינהלית', 'administrative', 'עתירה מינהלית תוגש ללא שיהוי ולא יאוחר מ-45 ימים מהמועד שבו נודע על ההחלטה.', 45, 'המועד שבו נודע על ההחלטה', 'תקנות בתי משפט לעניינים מינהליים (סדרי דין), התשס"א–2000', 1),
  ('ערעור מינהלי', 'administrative', 'ערעור על פסק דין בעתירה מינהלית.', 45, 'מתן פסק הדין', 'חוק בתי משפט לעניינים מינהליים, התש"ס–2000', 2),

  -- constitutional — בג"ץ
  ('עתירה לבג"ץ', 'constitutional', 'אין מועד קבוע בדין; העתירה כפופה לדוקטרינת השיהוי — יש להגישה במהירות הראויה.', NULL, 'המעשה המינהלי הנתקף', 'חוק-יסוד: השפיטה; תקנות סדר הדין בבית המשפט הגבוה לצדק, התשמ"ד–1984', 1),

  -- insolvency — חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018
  ('הגשת תביעת חוב לנאמן', 'insolvency', 'נושה מגיש תביעת חוב לנאמן בתוך התקופה שנקבעה בצו ובדין (כ-6 חודשים) — לאימות.', NULL, 'מתן צו לפתיחת הליכים', 'חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018', 1),
  ('התנגדות לבקשת צו לפתיחת הליכים', 'insolvency', 'מועד להגשת התנגדות לבקשה לצו לפתיחת הליכים; לפי החלטת בית המשפט/הרשם.', NULL, 'המצאת הבקשה', 'חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018', 2),

  -- traffic_administrative — תעבורה
  ('בקשה להישפט', 'traffic_administrative', 'מי שקיבל הודעת תשלום קנס רשאי לבקש להישפט בתוך 90 ימים מהמצאת ההודעה.', 90, 'המצאת הודעת תשלום הקנס', 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982, סעיף 229', 1),
  ('ערעור על פסק דין בעבירת תעבורה', 'traffic_administrative', 'ערעור על פסק דין בעבירת תעבורה.', 45, 'מתן פסק הדין', 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982, סעיף 199', 2);
