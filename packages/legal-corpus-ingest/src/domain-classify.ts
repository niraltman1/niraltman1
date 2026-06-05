import type { LegalSourceType } from '@factum-il/database';

/**
 * Domain taxonomy for the Israeli legal corpus.
 *
 * 17 content domains + 'other' (catch-all, target <2% of laws).
 * Each law is assigned exactly one primary domain based on its Hebrew name.
 */

export type LegalDomain =
  | 'criminal' | 'family' | 'labor' | 'real_property' | 'tax' | 'enforcement'
  | 'commercial' | 'civil' | 'civil_procedure' | 'health_welfare' | 'administrative'
  | 'environment' | 'agriculture' | 'infrastructure' | 'communications' | 'security'
  | 'traffic' | 'other';

/** Canonical domain order — used for batch file iteration and domain-index output. */
export const ALL_DOMAINS: readonly LegalDomain[] = [
  'criminal', 'family', 'labor', 'real_property', 'tax', 'enforcement',
  'commercial', 'civil', 'civil_procedure', 'health_welfare', 'administrative',
  'environment', 'agriculture', 'infrastructure', 'communications', 'security',
  'traffic', 'other',
];

/**
 * Normalize Hebrew law name before regex matching.
 *
 * OData law names use various Unicode variants for punctuation. Normalizing to
 * ASCII equivalents ensures patterns are consistent across data sources.
 *   – En-dash (U+2013), Em-dash (U+2014) → ASCII hyphen
 *   – Hebrew gershayim (U+05F4), curly double-quotes (U+201C/D) → ASCII "
 *   – Curly single-quotes (U+2018/9) → ASCII '
 */
function normalizeName(name: string): string {
  return name
    .replace(/[–—]/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

/**
 * Ordered classification rules — first match wins (most-specific first).
 *
 * IMPORTANT: None of these regexes use the /g flag. Using /g with RegExp.test()
 * maintains .lastIndex state between calls, causing every other call to skip matches.
 *
 * Ordering rationale:
 *   - Basic Laws before everything (anchored to start — prevents "חוק לתיקון פקודת חוקי היסוד" false positive)
 *   - Security before Criminal (ביטחון X ≠ עבירות X)
 *   - Criminal before Family (אלימות במשפחה = criminal, not family)
 *   - Traffic before Infrastructure (רכב מנועי ≠ utility regulation)
 *   - Agriculture before Environment (שמורות טבע kept ONLY in environment to resolve overlap)
 *   - Administrative last among content domains (broad patterns, catch non-specific government laws)
 */
/**
 * NOTE on \b word boundaries: JavaScript \b treats Hebrew characters as non-\w
 * (since \w = [a-zA-Z0-9_] only). This means \b is always false between two Hebrew
 * characters. All Hebrew patterns here avoid \b entirely.
 */
const DOMAIN_RULES: [RegExp, LegalDomain][] = [
  // ── 1. Basic Laws — anchored to START of string ───────────────────────────────────────────
  // /^חוק-?יסוד/ prevents "חוק לתיקון פקודת חוקי היסוד" from matching.
  [/^חוק-?יסוד/, 'administrative'],

  // ── 2. Security & military ────────────────────────────────────────────────────────────────
  // שירות.ה?ביטחון handles both "שירות ביטחון" and "שירות הביטחון" (with definite article).
  [/ביטחון.המדינה|ביטחון.לאומי|שירות.ה?ביטחון|מודיעין|שב"כ|מוסד\s|גיוס.לצבא|חיל.האוויר|חיל.הים|צה"ל|סוד.ממלכתי|פיקוד.העורף/, 'security'],

  // ── 3. Criminal ───────────────────────────────────────────────────────────────────────────
  // בתי.ה?סוהר handles "בתי סוהר" and "בתי הסוהר" (definite article).
  [/עונשין|סדר.הדין.הפלילי|עצורים|מעצרים|כלא|בתי.ה?סוהר|אסיר|עבריין|עבירות.מין|נשק.(?:חם|קר)|סמים|שחרור.מוקדם|שחרור.על.תנאי/, 'criminal'],
  [/אלימות.במשפחה/, 'criminal'],

  // ── 4. Family & succession ──────────────────────────────────────────────────────────────────
  [/נישואין|גירושין|ירושה|יורשים|כשרות.משפטית|אפוטרופסות|אימוץ.ילד|מזונות|מעמד.אישי|ענייני.משפחה|יחסי.ממון|הסכם.ממון/, 'family'],

  // ── 5. Labor & employment ─────────────────────────────────────────────────────────────────
  // ביטוח.ה?לאומי handles "ביטוח לאומי" and "הביטוח הלאומי" (definite article).
  // פיצויי.פיטורי[ןם] handles both the מקור (פיטורין) and the standard (פיטורים) forms.
  [/שכר.מינימום|שעות.עבודה|פיצויי.פיטורי[ןם]|בית.הדין.לעבודה|הסכמים.קיבוציים|ביטוח.ה?לאומי|ביטוח.אבטלה|חופשת.לידה|חופשה.שנתית|עבודת.נשים|זכות.השביתה|עובד.ומעביד/, 'labor'],

  // ── 6a. Taxation — מיסוי מקרקעין must be checked BEFORE the general מקרקעין rule below ──
  [/מיסוי.מקרקעין/, 'tax'],

  // ── 6. Real property, planning & tenancy (merged for practice convenience) ───────────────
  // תכנון.וה?בניה handles "תכנון ובניה" and "התכנון והבניה" (conjunctive + definite article).
  // בתים.ה?משותפים handles "בתים משותפים" and "הבתים המשותפים".
  [/מקרקעין|תכנון.וה?בניה|בתים.ה?משותפים|רישום.קרקעות|קרקע.חקלאי|שמאי.מקרקעין|סוכן.מקרקעין|הגנת.הדייר|דיור.מוגן|שכירות.הוגנת|שיכון|דמי.שכירות/, 'real_property'],

  // ── 7. Taxation ───────────────────────────────────────────────────────────────────────────
  [/מס.הכנסה|מס.ערך.מוסף|מס.שבח|מכס|בלו|מס.ריווחי.הון|מס.עיזבון|הכנסות.המדינה|ניכוי.מס|זיכוי.מס/, 'tax'],

  // ── 8. Enforcement & insolvency ───────────────────────────────────────────────────────────
  [/הוצאה.לפועל|פשיטת.רגל|חדלות.פירעון|פירוק.חברות|כינוס.נכסים|נאמן.לנכסי/, 'enforcement'],

  // ── 9. Commercial: companies, banking, insurance, securities, IP, competition ──────────────
  // זכות.יוצרים|זכויות.יוצרים handles both singular and plural copyright forms.
  [/חברות|שותפויות|ניירות.ערך|בנקאות|פיקוח.על.הבנקים|תחרות.כלכלית|מונופולין|פטנטים|זכות.יוצרים|זכויות.יוצרים|סימני.מסחר|קניין.רוחני|יבוא|יצוא|שוק.ההון|פיקוח.על.שירותים.פיננסיים|בורסה/, 'commercial'],
  [/ביטוח.(?:חיים|כללי|נפגעי|רכוש|ימי)|חברות.ביטוח|פיקוח.על.הביטוח/, 'commercial'],
  [/בנק.ישראל|עסקאות.מטבע|שטרות/, 'commercial'],

  // ── 10. Traffic, transport, aviation & shipping ───────────────────────────────────────────
  // רישי(?:ון|וי).נהיגה handles both "רישיון נהיגה" and "רישוי נהיגה" forms.
  [/תעבורה|רכב.מנועי|ספנות|הטיס|תעופה.אזרחית|רכבת|נמל|נהיגה.בשכרות|(?:רישיון|רישוי).נהיגה|כלי.טייס/, 'traffic'],

  // ── 11. Infrastructure & energy utilities ────────────────────────────────────────────────
  // גז.ה?(?:...) handles "גז טבעי" and "הגז הטבעי" (definite article).
  [/חשמל|גז.ה?(?:טבעי|לתחבורה|בטיחות)|נפט|תשתיות.לאומיות|אנרגיה|תאגידי.מים|ביוב|מוביל.מים|מי.שתייה/, 'infrastructure'],

  // ── 12. Agriculture & water resources ────────────────────────────────────────────────────
  // NOTE: שמורות טבע intentionally omitted here — kept only in 'environment' to avoid
  // misclassifying nature reserves as agriculture.
  [/חקלאות|(?:ייצור|שיווק).(?:חקלאי|הדרים|ירקות)|זרעים|דיג|משק.חלב|ניקוז|קרן.לפיתוח.חקלאי|יערות|גנים.לאומיים|פארקי.לאומי/, 'agriculture'],

  // ── 13. Communications & broadcasting ────────────────────────────────────────────────────
  [/תקשורת|שידור|בזק|הדואר|דואר.ישראל|תדרים|לוויין|שירות.שידור|רדיו/, 'communications'],

  // ── 14. Environment & nature conservation ────────────────────────────────────────────────
  // שמורות טבע is here (and ONLY here — not in agriculture).
  [/(?:הגנת|שמירת).הסביבה|זיהום.(?:אוויר|מים|קרקע)|אוויר.נקי|סביבה.חופית|פסולת|אסבסט|פליטות|ניהול.פסולת|חומרים.מסוכנים|שמורות.טבע/, 'environment'],

  // ── 15. Civil: torts, contracts, consumer protection, defamation, privacy ────────────────
  [/נזיקין|חוזים|אחריות.למוצרים|לשון.הרע|הוצאת.דיבה|הגנת.הפרטיות|נאמנות|חוזים.אחידים|הגנת.הצרכן|עוולות/, 'civil'],

  // ── 16. Civil procedure: courts, evidence, arbitration ───────────────────────────────────
  [/בתי.המשפט|(?:תקנות.)?סדר.הדין.האזרחי|תובענות.ייצוגיות|אכיפת.פסקי.חוץ|(?:פקודת.)?הראיות|בוררות|שיפוט/, 'civil_procedure'],

  // ── 17. Health, welfare, education & pensions ────────────────────────────────────────────
  // פנסי matches the shared root of "פנסיה" (noun) and "פנסיית" (construct: "פנסיית חובה").
  // נכי.רדיפות.הנאצים and מצרכים.ושירותים cover specific welfare/consumer laws.
  [/ביטוח.בריאות|זכויות.החולה|בריאות.הציבור|(?:בטיחות.)?מזון|מצרכים.ושירותים|רפואה|רוקחות|תרופות|חינוך|נגישות|(?:דמי.)?גמלה|קצבה|סיעוד|עמותות|פנסי|בית.חולים|שיקום|ניצולי.שואה|נכי.רדיפות.הנאצים|תגמולים.לחיילים|אנשים.עם.מוגבלות/, 'health_welfare'],

  // ── 18. Administrative: civil service, citizenship, immigration, elections, licensing ─────
  [/שירות.המדינה|עובדי.המדינה|אזרחות|כניסה.לישראל|עליה|חופש.המידע|מבקר.המדינה|הכנסת|ממשלה|נשיא.המדינה|עיריות|מועצות.(?:אזוריות|מקומיות)|אמנה|הסגרה|בחירות|לשכת.עורכי.הדין|רופאים|מהנדסים|רואי.חשבון|מקצוע.חופשי|ועדה.ממלכתית/, 'administrative'],
];

/** Classify an Israeli law by name into its primary legal domain. */
export function inferProcedureDomain(name: string): LegalDomain {
  const normalized = normalizeName(name);
  for (const [re, domain] of DOMAIN_RULES) {
    if (re.test(normalized)) return domain;
  }
  return 'other';
}

// Re-export LegalSourceType so callers of this module don't need a second import.
export type { LegalSourceType };
