import type { Repos } from '../db.js';

function today(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function seedDemo(repos: Repos): Promise<Record<string, number>> {
  const { db } = repos;

  const existing = (db.prepare('SELECT COUNT(*) AS c FROM Clients').get() as { c: number }).c;
  if (existing > 0) return { skipped: existing };

  // ── Clients ───────────────────────────────────────────────────────────────
  const clientIds = [
    db.prepare(`INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
                VALUES (?,?,?,?,?,?,?)`).run(
      'יוסף לוי', 'Yosef Levi', 'id', '123456789', '050-1234567', 'yosef@example.com', 'רחוב הרצל 12, תל אביב',
    ).lastInsertRowid,
    db.prepare(`INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
                VALUES (?,?,?,?,?,?,?)`).run(
      'דינה כהן', 'Dina Cohen', 'id', '987654321', '052-9876543', 'dina@example.com', 'שדרות בן גוריון 5, חיפה',
    ).lastInsertRowid,
    db.prepare(`INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
                VALUES (?,?,?,?,?,?,?)`).run(
      'אברהם ישראלי', 'Avraham Israeli', 'id', '456789123', '054-4567891', 'avraham@example.com', 'דרך העצמאות 33, ירושלים',
    ).lastInsertRowid,
    db.prepare(`INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
                VALUES (?,?,?,?,?,?,?)`).run(
      'שרה מזרחי', 'Sara Mizrahi', 'id', '321654987', '053-3216549', 'sara@example.com', 'רחוב בן יהודה 8, תל אביב',
    ).lastInsertRowid,
    db.prepare(`INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
                VALUES (?,?,?,?,?,?,?)`).run(
      "דוד אברמוביץ'", 'David Abramovitz', 'id', '654321789', '058-6543217', 'david@example.com', 'שוק הכרמל 3, תל אביב',
    ).lastInsertRowid,
  ];

  // ── Cases ─────────────────────────────────────────────────────────────────
  const caseStmt = db.prepare(`INSERT INTO Cases
    (client_id, case_number, title_he, case_type, procedure_type, status, court_name, judge_name, opened_date, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const caseIds = [
    caseStmt.run(clientIds[1], '1234-05-26', "כהן נ' עיריית תל אביב", 'civil', 'civil', 'open',
      'בית משפט שלום תל אביב', 'כב׳ השופטת רחל גולן', today(-60), 'תביעה לפיצויים בגין נזקי רכוש').lastInsertRowid,
    caseStmt.run(clientIds[0], '5678-03-24', 'לוי — עבירת תעבורה מנהלית', 'traffic_administrative', 'traffic_administrative', 'open',
      'בית משפט לתעבורה תל אביב', 'כב׳ השופט משה אבידן', today(-90), 'שלילת רישיון').lastInsertRowid,
    caseStmt.run(clientIds[2], '9012-07-25', 'ישראלי — חוזה שכירות', 'civil', 'civil', 'open',
      'בית משפט שלום ירושלים', null, today(-30), 'סכסוך שכירות דירה').lastInsertRowid,
    caseStmt.run(clientIds[3], '3456-01-26', 'מזרחי — פלילי תעבורה', 'criminal', 'traffic_criminal', 'open',
      'בית משפט שלום תל אביב', 'כב׳ השופטת יעל שמיר', today(-15), 'נהיגה בשכרות').lastInsertRowid,
    caseStmt.run(clientIds[4], '7890-11-24', "אברמוביץ' — ירושה", 'civil', 'civil', 'closed',
      'בית משפט לענייני משפחה תל אביב', 'כב׳ השופט אריה לוין', today(-200), 'חלוקת עיזבון').lastInsertRowid,
    caseStmt.run(null, '2345-08-25', 'בוררות עסקית', 'civil', 'civil', 'suspended',
      null, null, today(-45), 'סכסוך בין שותפים עסקיים').lastInsertRowid,
    caseStmt.run(clientIds[0], '6789-02-26', 'לוי — תיק אקדמי', 'academic', 'civil', 'open',
      null, null, today(-10), 'תיק לימודים — דיני חוזים').lastInsertRowid,
    caseStmt.run(clientIds[1], '1111-04-25', 'כהן — תביעת פיצויים', 'civil', 'civil', 'open',
      'בית משפט מחוזי תל אביב', 'כב׳ השופט דן אורן', today(-120), 'תביעת נזיקין').lastInsertRowid,
  ];

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const taskStmt = db.prepare(`INSERT INTO Tasks
    (title, case_id, client_id, status, urgency, due_date, notes)
    VALUES (?,?,?,?,?,?,?)`);

  taskStmt.run('הגשת כתב הגנה', caseIds[0], clientIds[1], 'pending', 'high', today(3), 'לצרף את כל המסמכים הרלוונטיים');
  taskStmt.run('תשלום אגרת בית משפט', caseIds[1], clientIds[0], 'pending', 'normal', today(7), null);
  taskStmt.run('פגישת הכנה עם לקוח', caseIds[2], clientIds[2], 'in_progress', 'critical', today(1), 'להכין שאלות לגבי תנאי השכירות');
  taskStmt.run('הגשת ערעור', caseIds[3], clientIds[3], 'pending', 'high', today(14), null);
  taskStmt.run('קבלת פסיקה', caseIds[4], clientIds[4], 'checked', 'normal', today(-5), 'הפסיקה התקבלה — תיק סגור');
  taskStmt.run('עדכון לקוח', caseIds[7], clientIds[1], 'pending', 'normal', today(7), null);

  // ── Stens Templates ───────────────────────────────────────────────────────
  const stensStmt = db.prepare(`INSERT INTO StensTemplates
    (name_he, name_en, category, form_schema, legal_basis, version, is_active)
    VALUES (?,?,?,?,?,?,1)`);

  stensStmt.run(
    'בקשה לדחיית דיון', 'Request for Hearing Postponement', 'civil',
    JSON.stringify([
      { name: 'case_number', labelHe: 'מספר תיק', type: 'text', required: true },
      { name: 'reason',      labelHe: 'נימוק',    type: 'text' },
      { name: 'new_date',    labelHe: 'תאריך מוצע', type: 'date' },
    ]),
    'תקנות סדר הדין האזרחי, תשע"ט-2018, תקנה 51', '1.0',
  );

  stensStmt.run(
    'ייפוי כוח כללי', 'General Power of Attorney', 'general',
    JSON.stringify([
      { name: 'client_name',   labelHe: 'שם הלקוח',          type: 'text', required: true },
      { name: 'id_number',     labelHe: 'מספר זהות',           type: 'text', required: true },
      { name: 'attorney_name', labelHe: 'שם עורך הדין',       type: 'text' },
    ]),
    'חוק ייפוי כוח, תשנ"ו-1996', '1.0',
  );

  stensStmt.run(
    'הודעה לבית המשפט', 'Court Notice', 'traffic',
    JSON.stringify([
      { name: 'case_number', labelHe: 'מספר תיק',      type: 'text', required: true },
      { name: 'court_name',  labelHe: 'בית המשפט',     type: 'select',
        options: ['שלום ת"א', 'שלום ירושלים', 'מחוזי ת"א'] },
      { name: 'message',     labelHe: 'תוכן ההודעה',   type: 'text' },
    ]),
    'תקנות סדר הדין האזרחי, תשע"ט-2018', '1.0',
  );

  // ── Academic ──────────────────────────────────────────────────────────────
  const subjectId = db.prepare(`INSERT INTO AcademicSubjects (name_he, name_en, description)
    VALUES (?,?,?)`).run(
    'דיני חוזים', 'Contract Law', 'יסודות דיני החוזים הישראלי — גמירות דעת, מסוימות, כשרות',
  ).lastInsertRowid;

  const courseId = db.prepare(`INSERT INTO AcademicCourses (subject_id, name_he, semester, year, notes)
    VALUES (?,?,?,?,?)`).run(
    subjectId, "דיני חוזים — סמסטר א' 2025-2026", "א'", 2025, 'קורס מבוא לדיני חוזים',
  ).lastInsertRowid;

  const qStmt = db.prepare(`INSERT INTO StudyQuestions
    (course_id, question_he, option_a, option_b, option_c, option_d, correct_answer, explanation)
    VALUES (?,?,?,?,?,?,?,?)`);

  qStmt.run(courseId,
    'מהו עיקרון תום הלב בדיני חוזים?',
    'חובת גילוי מלאה של כל המידע הרלוונטי',
    'חובת ניהול משא ומתן בתום לב ובדרך מקובלת',
    'חובת קיום החוזה בדיוק לפי תנאיו',
    'חובת תשלום פיצויים במקרה של הפרה',
    'b', 'סעיף 12 לחוק החוזים מחייב ניהול משא ומתן בתום לב',
  );

  qStmt.run(courseId,
    'מה מגדיר "נזק ממוני" לפי חוק הנזיקין?',
    'נזק שנגרם לרכוש בלבד',
    'כל נזק שניתן להעריכו בכסף',
    'נזק שנגרם כתוצאה מעוולה פלילית',
    'נזק פסיכולוגי בלבד',
    'b', 'נזק ממוני כולל הפסד השתכרות, הוצאות רפואיות ונזק לרכוש',
  );

  qStmt.run(courseId,
    'בית משפט שלום — מה הסמכות העניינית הכספית?',
    'עד 250,000 ₪',
    'עד 1,000,000 ₪',
    'עד 2,500,000 ₪',
    'ללא הגבלה',
    'c', 'בית משפט שלום מוסמך לדון בתביעות עד 2,500,000 ₪',
  );

  qStmt.run(courseId,
    'מה זמן ההתיישנות בתביעה אזרחית רגילה?',
    '3 שנים',
    '5 שנים',
    '7 שנים',
    '10 שנים',
    'c', 'חוק ההתיישנות, תשי"ח-1958, סעיף 5 — 7 שנים',
  );

  const counts = {
    clients:   clientIds.length,
    cases:     caseIds.length,
    tasks:     6,
    stens:     3,
    questions: 4,
    courses:   1,
  };

  return counts;
}
