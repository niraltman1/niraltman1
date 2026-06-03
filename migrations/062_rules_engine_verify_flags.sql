-- Attorney re-verification flags for two civil deadlines (per the legal review of PR #48).
--
-- During the in-chat review the reviewer approved the civil batch but asked to flag the
-- two numeric civil deadlines whose periods changed in the 2018 reform, so they are
-- re-verified against תקנות סדר הדין האזרחי, התשע"ט–2018 before production reliance.
--
-- Additive and conservative: only appends a note to the `description`. The
-- `deadline_days` values are intentionally left unchanged (60 / 30).

UPDATE Rules_Engine
SET description = description ||
    ' ⚠️ מועד זה לאימות מול תקנות סדר הדין האזרחי, התשע"ט–2018 לפני הסתמכות בייצור.'
WHERE procedure_type = 'civil'
  AND rule_name IN ('הגשת כתב הגנה', 'בקשה לביטול פסק דין שניתן בהיעדר הגנה')
  AND description NOT LIKE '%לאימות מול תקנות סדר הדין האזרחי%';
