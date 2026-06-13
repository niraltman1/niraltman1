-- Migration 078: Seed StensTemplates with 8 real Hebrew legal form templates.
-- form_schema is a JSON array of {name, label_he, type, required, options?} field definitions.
-- Legal basis references are indicative — require law-firm review before production use.

INSERT OR IGNORE INTO StensTemplates (name_he, name_en, category, legal_basis, instructions, form_schema) VALUES

-- 1. Small claims
('תביעה קטנה', 'Small Claims', 'civil', 'תקנות שיפוט בתביעות קטנות, תשל"ז-1977', 'מלא את פרטי התובע, הנתבע וסכום התביעה. צרף אסמכתאות תומכות.',
'[
  {"name":"plaintiff_name","label_he":"שם התובע (מלא)","type":"text","required":true},
  {"name":"plaintiff_id","label_he":"תעודת זהות תובע","type":"text","required":true},
  {"name":"plaintiff_address","label_he":"כתובת התובע","type":"text","required":true},
  {"name":"defendant_name","label_he":"שם הנתבע","type":"text","required":true},
  {"name":"defendant_address","label_he":"כתובת הנתבע","type":"text","required":false},
  {"name":"claim_amount","label_he":"סכום התביעה (₪)","type":"number","required":true},
  {"name":"claim_description","label_he":"תיאור העילה ועובדות התביעה","type":"textarea","required":true},
  {"name":"evidence_list","label_he":"רשימת ראיות ומסמכים מצורפים","type":"textarea","required":false},
  {"name":"requested_relief","label_he":"הסעד המבוקש","type":"textarea","required":true}
]'),

-- 2. Statement of Claim (civil)
('כתב תביעה אזרחי', 'Statement of Claim', 'civil', 'תקנות סדר הדין האזרחי, תשע"ט-2018', 'יש לצרף אסמכתאות לכל טענה עובדתית. ציין בית משפט מוסמך לפי הסמכות העניינית והמקומית.',
'[
  {"name":"court_name","label_he":"שם בית המשפט","type":"select","required":true,"options":["שלום","מחוזי","עליון"]},
  {"name":"case_number","label_he":"מספר תיק (אם קיים)","type":"text","required":false},
  {"name":"plaintiff_full","label_he":"שם התובע המלא + ת.ז./ח.פ.","type":"text","required":true},
  {"name":"defendant_full","label_he":"שם הנתבע המלא + ת.ז./ח.פ.","type":"text","required":true},
  {"name":"claim_amount","label_he":"סכום הנזק הנטען (₪)","type":"number","required":false},
  {"name":"cause_of_action","label_he":"עילת התביעה","type":"select","required":true,"options":["חוזה","נזיקין","עשיית עושר","אחר"]},
  {"name":"facts","label_he":"פירוט העובדות","type":"textarea","required":true},
  {"name":"legal_arguments","label_he":"טענות משפטיות","type":"textarea","required":true},
  {"name":"relief","label_he":"הסעד המבוקש","type":"textarea","required":true}
]'),

-- 3. Divorce Petition (family)
('תביעה לגירושין', 'Divorce Petition', 'family', 'חוק שיפוט בתי דין רבניים, תשי"ג-1953; חוק יחסי ממון בין בני-זוג, תשל"ג-1973', 'יש להגיש לבית הדין הדתי המוסמך. צרף תעודת נישואין ותעודות ילודה של ילדים משותפים.',
'[
  {"name":"petitioner_name","label_he":"שם המבקש/ת","type":"text","required":true},
  {"name":"petitioner_id","label_he":"תעודת זהות מבקש/ת","type":"text","required":true},
  {"name":"respondent_name","label_he":"שם המשיב/ה","type":"text","required":true},
  {"name":"marriage_date","label_he":"תאריך הנישואין","type":"date","required":true},
  {"name":"marriage_registry","label_he":"מקום רישום הנישואין","type":"text","required":true},
  {"name":"children","label_he":"שמות ילדים משותפים ותאריכי לידה","type":"textarea","required":false},
  {"name":"grounds","label_he":"עילות הגירושין","type":"textarea","required":true},
  {"name":"property_dispute","label_he":"האם קיים סכסוך רכושי?","type":"select","required":true,"options":["כן","לא"]},
  {"name":"custody_request","label_he":"הסדרת משמורת מבוקשת","type":"textarea","required":false}
]'),

-- 4. Maintenance Claim (family)
('תביעת מזונות', 'Maintenance Claim', 'family', 'חוק לתיקון דיני המשפחה (מזונות), תשי"ט-1959', 'יש לצרף אישורי הכנסה, דפי חשבון וקבלות הוצאות הילד.',
'[
  {"name":"claimant_name","label_he":"שם התובע/ת","type":"text","required":true},
  {"name":"claimant_id","label_he":"ת.ז. תובע/ת","type":"text","required":true},
  {"name":"minor_names","label_he":"שמות הקטינים","type":"textarea","required":true},
  {"name":"minor_birthdates","label_he":"תאריכי לידת הקטינים","type":"textarea","required":true},
  {"name":"defendant_name","label_he":"שם החייב","type":"text","required":true},
  {"name":"defendant_income","label_he":"הכנסת החייב המשוערת (₪/חודש)","type":"number","required":false},
  {"name":"monthly_expenses","label_he":"הוצאות חודשיות לילד (₪)","type":"number","required":true},
  {"name":"current_custody","label_he":"הסדר משמורת נוכחי","type":"textarea","required":true},
  {"name":"requested_amount","label_he":"סכום מזונות מבוקש (₪/חודש)","type":"number","required":true}
]'),

-- 5. Labor Court Claim
('תביעה לבית הדין לעבודה', 'Labour Court Claim', 'labour', 'חוק בית הדין לעבודה, תשכ"ט-1969; חוק הגנת השכר, תשי"ח-1958', 'הגש/י לבית הדין האזורי לעבודה בהתאם למקום העבודה. צרף חוזה עבודה, תלושי שכר ומכתב פיטורים.',
'[
  {"name":"employee_name","label_he":"שם העובד/ת","type":"text","required":true},
  {"name":"employee_id","label_he":"ת.ז. עובד/ת","type":"text","required":true},
  {"name":"employer_name","label_he":"שם המעסיק","type":"text","required":true},
  {"name":"employer_id","label_he":"ח.פ. / ת.ז. מעסיק","type":"text","required":true},
  {"name":"employment_start","label_he":"תאריך תחילת עבודה","type":"date","required":true},
  {"name":"employment_end","label_he":"תאריך סיום עבודה","type":"date","required":false},
  {"name":"last_salary","label_he":"שכר אחרון ברוטו (₪/חודש)","type":"number","required":true},
  {"name":"claim_type","label_he":"סוג התביעה","type":"select","required":true,"options":["פיצויי פיטורים","שכר לא משולם","הפרשות סוציאליות","הלנת שכר","הפרת חוזה","אחר"]},
  {"name":"claim_amount","label_he":"סכום הנזק הנטען (₪)","type":"number","required":true},
  {"name":"claim_details","label_he":"פירוט הנסיבות","type":"textarea","required":true}
]'),

-- 6. Administrative Appeal
('ערר מנהלי', 'Administrative Appeal', 'administrative', 'חוק בתי משפט לעניינים מנהליים, תש"ס-2000; תקנות בתי משפט לעניינים מנהליים, תשס"א-2001', 'יש להגיש תוך 45 יום מיום ההחלטה. צרף את ההחלטה המינהלית המקורית.',
'[
  {"name":"appellant_name","label_he":"שם העורר/ת","type":"text","required":true},
  {"name":"appellant_id","label_he":"ת.ז. / ח.פ.","type":"text","required":true},
  {"name":"authority_name","label_he":"שם הרשות המינהלית","type":"text","required":true},
  {"name":"decision_date","label_he":"תאריך ההחלטה המערערת","type":"date","required":true},
  {"name":"decision_reference","label_he":"מספר/אסמכתא ההחלטה","type":"text","required":false},
  {"name":"grounds","label_he":"עילות הערר (חריגה מסמכות / אי-סבירות / שיקולים זרים)","type":"textarea","required":true},
  {"name":"relief","label_he":"הסעד המבוקש","type":"textarea","required":true},
  {"name":"urgency","label_he":"האם נדרש צו ביניים דחוף?","type":"select","required":true,"options":["כן","לא"]}
]'),

-- 7. Traffic Fine Appeal
('ערעור על דוח תנועה', 'Traffic Fine Appeal', 'traffic', 'פקודת התעבורה [נוסח חדש], תשכ"א-1961; תקנות התעבורה, תשכ"א-1961', 'הגש/י בקשה לבית המשפט לתעבורה תוך 30 יום ממסירת הדוח. ציין את מספר הדוח.',
'[
  {"name":"appellant_name","label_he":"שם המערער/ת","type":"text","required":true},
  {"name":"appellant_id","label_he":"ת.ז.","type":"text","required":true},
  {"name":"license_number","label_he":"מספר רישיון רכב","type":"text","required":true},
  {"name":"ticket_number","label_he":"מספר הדוח","type":"text","required":true},
  {"name":"ticket_date","label_he":"תאריך הדוח","type":"date","required":true},
  {"name":"offence","label_he":"סוג העבירה הנטענת","type":"text","required":true},
  {"name":"fine_amount","label_he":"סכום הקנס (₪)","type":"number","required":true},
  {"name":"defence","label_he":"טיעוני ההגנה","type":"textarea","required":true},
  {"name":"witnesses","label_he":"עדים (שם, כתובת, תפקיד)","type":"textarea","required":false}
]'),

-- 8. Criminal — Bail Application
('בקשה לשחרור בערבות', 'Bail Application', 'criminal', 'חוק המעצרים, תשנ"ו-1996, סעיפים 21-38', 'הגש/י לבית המשפט אשר בפניו תלוי ועומד ההליך הפלילי. צרף תצהיר ערב ואישורים.',
'[
  {"name":"suspect_name","label_he":"שם החשוד/הנאשם","type":"text","required":true},
  {"name":"suspect_id","label_he":"ת.ז.","type":"text","required":true},
  {"name":"case_number","label_he":"מספר תיק","type":"text","required":true},
  {"name":"arrest_date","label_he":"תאריך המעצר","type":"date","required":true},
  {"name":"charges","label_he":"העבירות המיוחסות","type":"textarea","required":true},
  {"name":"bail_amount","label_he":"סכום ערבות מוצע (₪)","type":"number","required":false},
  {"name":"guarantor_name","label_he":"שם הערב","type":"text","required":false},
  {"name":"residence_address","label_he":"כתובת מגורים קבועה","type":"text","required":true},
  {"name":"grounds_for_release","label_he":"טיעונים לשחרור","type":"textarea","required":true},
  {"name":"conditions_offered","label_he":"תנאי שחרור מוצעים","type":"textarea","required":false}
]');
