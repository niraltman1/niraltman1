import { describe, it, expect } from 'vitest';
import { inferProcedureDomain } from '../domain-classify.js';

describe('inferProcedureDomain', () => {
  // ── Criminal ─────────────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק העונשין, התשל"ז–1977', 'criminal'],
    ['חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982', 'criminal'],
    ['חוק המעצרים, התשנ"ו–1996', 'criminal'],
    ['פקודת בתי הסוהר [נוסח חדש], התשל"ב–1971', 'criminal'],
    ['חוק שחרור על תנאי ממאסר, התשס"א–2001', 'criminal'],
  ])('%s → criminal', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  it('אלימות במשפחה → criminal, not family', () => {
    expect(inferProcedureDomain('חוק למניעת אלימות במשפחה, התשנ"א–1991')).toBe('criminal');
  });

  // ── Family ──────────────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק הירושה, התשכ"ה–1965', 'family'],
    ['חוק הכשרות המשפטית והאפוטרופסות, התשכ"ב–1962', 'family'],
    ['חוק שיפוט בענייני התרת נישואין (מקרים מיוחדים וסמכות בין-לאומית), התשכ"ט–1969', 'family'],
    ['חוק מזונות (הבטחת תשלום), התשל"ב–1972', 'family'],
    ['חוק יחסי ממון בין בני זוג, התשל"ג–1973', 'family'],
  ])('%s → family', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Labor ────────────────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק שכר מינימום, התשמ"ז–1987', 'labor'],
    ['חוק הביטוח הלאומי [נוסח משולב], התשנ"ה–1995', 'labor'],
    ['חוק פיצויי פיטורים, התשכ"ג–1963', 'labor'],
    ['חוק חופשה שנתית, התשי"א–1951', 'labor'],
    ['חוק עבודת נשים, התשי"ד–1954', 'labor'],
  ])('%s → labor', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Real property ─────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק המקרקעין, התשכ"ט–1969', 'real_property'],
    ['חוק הגנת הדייר [נוסח משולב], התשל"ב–1972', 'real_property'],
    ['חוק התכנון והבניה, התשכ"ה–1965', 'real_property'],
    ['חוק הבתים המשותפים [נוסח משולב], התשכ"ו–1965', 'real_property'],
    ['חוק שיכון עממי (הוראות מיוחדות), התשל"ד–1974', 'real_property'],
  ])('%s → real_property', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  it('חוק-יסוד: מקרקעי ישראל → administrative, not real_property', () => {
    expect(inferProcedureDomain('חוק-יסוד: מקרקעי ישראל')).toBe('administrative');
  });

  // ── Tax ──────────────────────────────────────────────────────────────────────────────────
  it.each([
    ['פקודת מס הכנסה [נוסח חדש]', 'tax'],
    ['חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג–1963', 'tax'],
    ['חוק מס ערך מוסף, התשל"ו–1975', 'tax'],
    ['חוק המכס, התשכ"ג–1963', 'tax'],
  ])('%s → tax', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Enforcement ───────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק ההוצאה לפועל, התשכ"ז–1967', 'enforcement'],
    ['חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018', 'enforcement'],
  ])('%s → enforcement', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Commercial ───────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק החברות, התשנ"ט–1999', 'commercial'],
    ['חוק ניירות ערך, התשכ"ח–1968', 'commercial'],
    ['חוק הבנקאות (שירות ללקוח), התשמ"א–1981', 'commercial'],
    ['חוק הפטנטים, התשכ"ז–1967', 'commercial'],
    ['חוק זכות יוצרים, התשס"ח–2007', 'commercial'],
    ['חוק עסקאות מטבע חוץ, התשנ"ב–1992', 'commercial'],
  ])('%s → commercial', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  it('ביטוח רכב מנועי → traffic, not commercial', () => {
    expect(inferProcedureDomain('חוק פיצויים לנפגעי תאונות דרכים, התשל"ה–1975')).not.toBe('commercial');
    expect(inferProcedureDomain('חוק הביטוח הלאומי [נוסח משולב], התשנ"ה–1995')).toBe('labor');
  });

  // ── Traffic ───────────────────────────────────────────────────────────────────────────
  it.each([
    ['פקודת התעבורה [נוסח חדש]', 'traffic'],
    ['חוק שירות הספנות (כלי שיט), התשכ" א–1960', 'traffic'],
    ['חוק הטיס, התשע"א–2011', 'traffic'],
    ['חוק רישוי נהיגה, התשל"ה–1975', 'traffic'],
  ])('%s → traffic', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  it('חוק ביטוח רכב מנועי → traffic (רכב מנועי beats commercial insurance)', () => {
    // Vehicle insurance is a traffic-domain law, not a commercial insurance law.
    expect(inferProcedureDomain('חוק ביטוח רכב מנועי (ביטוח חובה), התש"ל–1970')).toBe('traffic');
  });

  // ── Infrastructure ────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק החשמל, התשי"ד–1954', 'infrastructure'],
    ['חוק תאגידי מים וביוב, התשס"א–2001', 'infrastructure'],
    ['חוק הגז הטבעי, התשס"ב–2002', 'infrastructure'],
    ['חוק נפט, התשי"ב–1952', 'infrastructure'],
  ])('%s → infrastructure', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Agriculture ───────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק הזרעים, התשי"ז–1956', 'agriculture'],
    ['חוק הדיג, התשי"א–1950', 'agriculture'],
    ['חוק גנים לאומיים, שמורות טבע, אתרים לאומיים ואתרי הנצחה, התשנ"ב–1992', 'agriculture'],
    ['חוק יערות, התשמ"ו–1986', 'agriculture'],
  ])('%s → agriculture', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Communications ────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק התקשורת (בזק ושידורים), התשמ"ב–1982', 'communications'],
    ['חוק הדואר, התשמ"ו–1986', 'communications'],
    ['חוק הרדיו, התשי"ד–1955', 'communications'],
    ['חוק הלוויין, התשס"א–2001', 'communications'],
  ])('%s → communications', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Environment ───────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק הגנת הסביבה (סמכויות פיקוח ואכיפה), התשע"א–2011', 'environment'],
    ['חוק אוויר נקי, התשס"ח–2008', 'environment'],
    ['חוק פינוי ומיחזור פסולת אריזות, התשע"א–2011', 'environment'],
    ['חוק חומרים מסוכנים, התשנ"ג–1993', 'environment'],
  ])('%s → environment', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Civil ─────────────────────────────────────────────────────────────────────────────
  it.each([
    ['פקודת הנזיקין [נוסח חדש]', 'civil'],
    ['חוק איסור לשון הרע, התשכ"ה–1965', 'civil'],
    ['חוק הגנת הצרכן, התשמ"א–1981', 'civil'],
    ['חוק חוזים אחידים, התשמ"ג–1982', 'civil'],
  ])('%s → civil', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Civil procedure ───────────────────────────────────────────────────────────────────
  it.each([
    ['תקנות סדר הדין האזרחי, התשמ"ד–1984', 'civil_procedure'],
    ['פקודת הראיות [נוסח חדש], התשל"א–1971', 'civil_procedure'],
    ['חוק בתי המשפט [נוסח משולב], התשמ"ד–1984', 'civil_procedure'],
    ['חוק בוררות, התשכ"ח–1968', 'civil_procedure'],
    ['חוק תובענות ייצוגיות, התשס"ו–2006', 'civil_procedure'],
  ])('%s → civil_procedure', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Health & welfare ──────────────────────────────────────────────────────────────────
  it.each([
    ['חוק ביטוח בריאות ממלכתי, התשנ"ד–1994', 'health_welfare'],
    ['חוק זכויות החולה, התשנ"ו–1996', 'health_welfare'],
    ['חוק הפיקוח על מצרכים ושירותים, התשי"ח–1957', 'health_welfare'],
    ['חוק חינוך ממלכתי, התשי"ג–1953', 'health_welfare'],
    ['חוק נכי רדיפות הנאצים, התשי"ז–1957', 'health_welfare'],
    ['חוק גמלת סיעוד לזקן, התשמ"ח–1988', 'health_welfare'],
    ['חוק פנסיית חובה, התשפ"ב–2022', 'health_welfare'],
  ])('%s → health_welfare', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Security ──────────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק שירות הביטחון הכללי, התשס"ב–2002', 'security'],
    ['חוק שירות ביטחון [נוסח משולב], התשמ"ו–1986', 'security'],
    ['חוק יסודות המשפט (ביטחון המדינה), התשנ"ג–1993', 'security'],
    ['חוק המוסד למודיעין ולמשימות מיוחדות, התשס"ב–2002', 'security'],
  ])('%s → security', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Administrative ────────────────────────────────────────────────────────────────────
  it.each([
    ['חוק-יסוד: כבוד האדם וחירותו', 'administrative'],
    ['חוק-יסוד: חופש העיסוק', 'administrative'],
    ['חוק שירות המדינה (מינויים) [נוסח משולב], התשי"ט–1959', 'administrative'],
    ['חוק האזרחות, התשי"ב–1952', 'administrative'],
    ['חוק הכניסה לישראל, התשי"ב–1952', 'administrative'],
    ['חוק חופש המידע, התשנ"ח–1998', 'administrative'],
    ['חוק מבקר המדינה [נוסח משולב], התשי"ח–1958', 'administrative'],
    ['חוק הבחירות לכנסת [נוסח משולב], התשכ"ט–1969', 'administrative'],
    ['חוק לשכת עורכי הדין, התשכ"א–1961', 'administrative'],
  ])('%s → administrative', (name, expected) => {
    expect(inferProcedureDomain(name)).toBe(expected);
  });

  // ── Unicode normalization ─────────────────────────────────────────────────────────────
  it('en-dash (U+2013) in law name is normalized before matching', () => {
    // "–" is U+2013 en-dash, normalized to ASCII hyphen before matching.
    expect(inferProcedureDomain('חוק-יסוד: כבוד האדם וחירותו')).toBe('administrative');
    expect(inferProcedureDomain('חוק–יסוד: כבוד האדם וחירותו')).toBe('administrative');
  });

  it('חוק לתיקון פקודת חוקי היסוד → not administrative (not a basic law)', () => {
    // The ^ anchor on /^חוק-?יסוד/ prevents this non-basic-law name from matching.
    expect(inferProcedureDomain('חוק לתיקון פקודת חוקי היסוד')).not.toBe('administrative');
  });
});
