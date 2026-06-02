import type { LegalSourceType } from '@factum-il/database';

/**
 * The core Israeli legal corpus, grouped by domain. This is metadata only (titles,
 * citations, canonical URLs) — the verbatim text is fetched at ingest time from the
 * "ספר החוקים הפתוח" project on the open, public-domain Hebrew WikiSource, and is
 * never authored here. gov.il guideline pages are best-effort.
 *
 * NOTE ON wikiTitle ACCURACY: every entry's `wikiTitle` is the WikiSource article
 * title used to build the fetch URL. The original 28 entries are verified; the
 * domain blocks added afterwards (Basic Laws, Labor, Family, Property/Torts,
 * Commercial, Public/Administrative, and the extra Criminal entries) are best-effort
 * titles to be confirmed on the FIRST ingest run. This is safe by design: the
 * ingester reports-and-skips any page it cannot fetch — it never fabricates text —
 * so a wrong title yields a logged miss to fix, never bad legal content.
 */
export interface ManifestEntry {
  sourceKey:       string;
  titleHe:         string;
  shortName:       string;
  citation:        string;
  sourceType:      LegalSourceType;
  procedureDomain: string;
  year:            number | null;
  /** Hebrew WikiSource article title (preferred, structured). */
  wikiTitle?:      string;
  /** Absolute URL for non-WikiSource sources (gov.il). */
  url?:            string;
}

const WS = 'https://he.wikisource.org/wiki/';

/** Build the fetch URL for an entry (encodes the Hebrew WikiSource title). */
export function entryUrl(e: ManifestEntry): string {
  if (e.url) return e.url;
  if (e.wikiTitle) return WS + encodeURIComponent(e.wikiTitle.replace(/ /g, '_'));
  return '';
}

export const LEGAL_CORPUS_MANIFEST: ManifestEntry[] = [
  // ── Criminal & Evidence ──────────────────────────────────────────────
  { sourceKey: 'criminal_procedure_law_1982', titleHe: 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982', shortName: 'חסד"פ', citation: 'חוק סדר הדין הפלילי [נוסח משולב], התשמ"ב–1982', sourceType: 'statute', procedureDomain: 'criminal', year: 1982, wikiTitle: 'חוק סדר הדין הפלילי [נוסח משולב]' },
  { sourceKey: 'criminal_procedure_arrests_1996', titleHe: 'חוק סדר הדין הפלילי (סמכויות אכיפה – מעצרים), התשנ"ו–1996', shortName: 'חוק המעצרים', citation: 'חוק סדר הדין הפלילי (סמכויות אכיפה – מעצרים), התשנ"ו–1996', sourceType: 'statute', procedureDomain: 'criminal', year: 1996, wikiTitle: 'חוק סדר הדין הפלילי (סמכויות אכיפה – מעצרים)' },
  { sourceKey: 'criminal_procedure_regulations_1974', titleHe: 'תקנות סדר הדין הפלילי, התשל"ד–1974', shortName: 'תקסד"פ', citation: 'תקנות סדר הדין הפלילי, התשל"ד–1974', sourceType: 'regulation', procedureDomain: 'criminal', year: 1974, wikiTitle: 'תקנות סדר הדין הפלילי' },
  { sourceKey: 'penal_law_1977', titleHe: 'חוק העונשין, התשל"ז–1977', shortName: 'חוק העונשין', citation: 'חוק העונשין, התשל"ז–1977', sourceType: 'statute', procedureDomain: 'criminal', year: 1977, wikiTitle: 'חוק העונשין' },
  { sourceKey: 'evidence_ordinance_1971', titleHe: 'פקודת הראיות [נוסח חדש], התשל"א–1971', shortName: 'פקודת הראיות', citation: 'פקודת הראיות [נוסח חדש], התשל"א–1971', sourceType: 'ordinance', procedureDomain: 'criminal', year: 1971, wikiTitle: 'פקודת הראיות' },
  { sourceKey: 'criminal_procedure_interrogation_2002', titleHe: 'חוק סדר הדין הפלילי (חקירת חשודים), התשס"ב–2002', shortName: 'חוק חקירת חשודים', citation: 'חוק סדר הדין הפלילי (חקירת חשודים), התשס"ב–2002', sourceType: 'statute', procedureDomain: 'criminal', year: 2002, wikiTitle: 'חוק סדר הדין הפלילי (חקירת חשודים)' },
  { sourceKey: 'criminal_procedure_body_search_1996', titleHe: 'חוק סדר הדין הפלילי (סמכויות אכיפה - חיפוש בגוף ונטילת אמצעי זיהוי), התשנ"ו–1996', shortName: 'חוק חיפוש בגוף', citation: 'חוק סדר הדין הפלילי (סמכויות אכיפה - חיפוש בגוף ונטילת אמצעי זיהוי), התשנ"ו–1996', sourceType: 'statute', procedureDomain: 'criminal', year: 1996, wikiTitle: 'חוק סדר הדין הפלילי (סמכויות אכיפה - חיפוש בגוף ונטילת אמצעי זיהוי)' },
  { sourceKey: 'criminal_information_rehab_2019', titleHe: 'חוק המידע הפלילי ותקנת השבים, התשע"ט–2019', shortName: 'חוק המידע הפלילי', citation: 'חוק המידע הפלילי ותקנת השבים, התשע"ט–2019', sourceType: 'statute', procedureDomain: 'criminal', year: 2019, wikiTitle: 'חוק המידע הפלילי ותקנת השבים' },
  { sourceKey: 'secret_monitoring_law_1979', titleHe: 'חוק האזנת סתר, התשל"ט–1979', shortName: 'חוק האזנת סתר', citation: 'חוק האזנת סתר, התשל"ט–1979', sourceType: 'statute', procedureDomain: 'criminal', year: 1979, wikiTitle: 'חוק האזנת סתר' },
  { sourceKey: 'crime_victims_rights_2001', titleHe: 'חוק זכויות נפגעי עבירה, התשס"א–2001', shortName: 'חוק זכויות נפגעי עבירה', citation: 'חוק זכויות נפגעי עבירה, התשס"א–2001', sourceType: 'statute', procedureDomain: 'criminal', year: 2001, wikiTitle: 'חוק זכויות נפגעי עבירה' },

  // ── Civil, Contracts & Execution ─────────────────────────────────────
  { sourceKey: 'civil_procedure_regulations_2018', titleHe: 'תקנות סדר הדין האזרחי, התשע"ט–2018', shortName: 'תקסד"א', citation: 'תקנות סדר הדין האזרחי, התשע"ט–2018', sourceType: 'regulation', procedureDomain: 'civil', year: 2018, wikiTitle: 'תקנות סדר הדין האזרחי, תשע"ט-2018' },
  { sourceKey: 'execution_law_1967', titleHe: 'חוק ההוצאה לפועל, התשכ"ז–1967', shortName: 'חוק ההוצאה לפועל', citation: 'חוק ההוצאה לפועל, התשכ"ז–1967', sourceType: 'statute', procedureDomain: 'civil', year: 1967, wikiTitle: 'חוק ההוצאה לפועל' },
  { sourceKey: 'execution_regulations_1979', titleHe: 'תקנות ההוצאה לפועל, התש"ם–1979', shortName: 'תקנות ההוצאה לפועל', citation: 'תקנות ההוצאה לפועל, התש"ם–1979', sourceType: 'regulation', procedureDomain: 'civil', year: 1979, wikiTitle: 'תקנות ההוצאה לפועל' },
  { sourceKey: 'insolvency_law_2018', titleHe: 'חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018', shortName: 'חוק חדלות פירעון', citation: 'חוק חדלות פירעון ושיקום כלכלי, התשע"ח–2018', sourceType: 'statute', procedureDomain: 'insolvency', year: 2018, wikiTitle: 'חוק חדלות פירעון ושיקום כלכלי' },
  { sourceKey: 'insolvency_regulations_2019', titleHe: 'תקנות חדלות פירעון ושיקום כלכלי, התשע"ט–2019', shortName: 'תקנות חדלות פירעון', citation: 'תקנות חדלות פירעון ושיקום כלכלי, התשע"ט–2019', sourceType: 'regulation', procedureDomain: 'insolvency', year: 2019, wikiTitle: 'תקנות חדלות פירעון ושיקום כלכלי' },
  { sourceKey: 'contracts_general_1973', titleHe: 'חוק החוזים (חלק כללי), התשל"ג–1973', shortName: 'חוק החוזים (חלק כללי)', citation: 'חוק החוזים (חלק כללי), התשל"ג–1973', sourceType: 'statute', procedureDomain: 'civil', year: 1973, wikiTitle: 'חוק החוזים (חלק כללי)' },
  { sourceKey: 'contracts_remedies_1970', titleHe: 'חוק החוזים (תרופות בשל הפרת חוזה), התשל"א–1970', shortName: 'חוק התרופות', citation: 'חוק החוזים (תרופות בשל הפרת חוזה), התשל"א–1970', sourceType: 'statute', procedureDomain: 'civil', year: 1970, wikiTitle: 'חוק החוזים (תרופות בשל הפרת חוזה)' },
  { sourceKey: 'sales_law_1968', titleHe: 'חוק המכר, התשכ"ח–1968', shortName: 'חוק המכר', citation: 'חוק המכר, התשכ"ח–1968', sourceType: 'statute', procedureDomain: 'civil', year: 1968, wikiTitle: 'חוק המכר' },

  // ── Traffic & Administrative ─────────────────────────────────────────
  { sourceKey: 'traffic_ordinance', titleHe: 'פקודת התעבורה [נוסח חדש]', shortName: 'פקודת התעבורה', citation: 'פקודת התעבורה [נוסח חדש]', sourceType: 'ordinance', procedureDomain: 'traffic', year: null, wikiTitle: 'פקודת התעבורה' },
  { sourceKey: 'traffic_regulations_1961', titleHe: 'תקנות התעבורה, התשכ"א–1961', shortName: 'תקנות התעבורה', citation: 'תקנות התעבורה, התשכ"א–1961', sourceType: 'regulation', procedureDomain: 'traffic', year: 1961, wikiTitle: 'תקנות התעבורה' },
  { sourceKey: 'administrative_offenses_1985', titleHe: 'חוק העבירות המינהליות, התשמ"ו–1985', shortName: 'חוק העבירות המינהליות', citation: 'חוק העבירות המינהליות, התשמ"ו–1985', sourceType: 'statute', procedureDomain: 'administrative', year: 1985, wikiTitle: 'חוק העבירות המינהליות' },

  // ── Courts, Ethics & Institutional Guidelines ────────────────────────
  { sourceKey: 'courts_law_1984', titleHe: 'חוק בתי המשפט [נוסח משולב], התשמ"ד–1984', shortName: 'חוק בתי המשפט', citation: 'חוק בתי המשפט [נוסח משולב], התשמ"ד–1984', sourceType: 'statute', procedureDomain: 'courts', year: 1984, wikiTitle: 'חוק בתי המשפט' },
  { sourceKey: 'police_ordinance_1971', titleHe: 'פקודת המשטרה [נוסח חדש], התשל"א–1971', shortName: 'פקודת המשטרה', citation: 'פקודת המשטרה [נוסח חדש], התשל"א–1971', sourceType: 'ordinance', procedureDomain: 'institutional', year: 1971, wikiTitle: 'פקודת המשטרה [נוסח חדש]' },
  { sourceKey: 'public_defender_law_1995', titleHe: 'חוק הסניגוריה הציבורית, התשנ"ו–1995', shortName: 'חוק הסניגוריה הציבורית', citation: 'חוק הסניגוריה הציבורית, התשנ"ו–1995', sourceType: 'statute', procedureDomain: 'institutional', year: 1995, wikiTitle: 'חוק הסניגוריה הציבורית' },
  { sourceKey: 'bar_ethics_rules_1986', titleHe: 'כללי לשכת עורכי הדין (אתיקה מקצועית), התשמ"ו–1986', shortName: 'כללי האתיקה', citation: 'כללי לשכת עורכי הדין (אתיקה מקצועית), התשמ"ו–1986', sourceType: 'rules', procedureDomain: 'ethics', year: 1986, wikiTitle: 'כללי לשכת עורכי הדין (אתיקה מקצועית)' },
  { sourceKey: 'state_attorney_guidelines', titleHe: 'הנחיות פרקליט המדינה', shortName: 'הנחיות פרקליט המדינה', citation: 'הנחיות פרקליט המדינה', sourceType: 'guideline', procedureDomain: 'institutional', year: null, url: 'https://www.gov.il/he/departments/policies/stat_attorney_guidelines' },
  { sourceKey: 'ag_guidelines', titleHe: 'הנחיות היועץ המשפטי לממשלה', shortName: 'הנחיות היועמ"ש', citation: 'הנחיות היועץ המשפטי לממשלה', sourceType: 'guideline', procedureDomain: 'institutional', year: null, url: 'https://www.gov.il/he/departments/policies/ag_guidelines' },
  { sourceKey: 'insolvency_commissioner_directives', titleHe: 'הוראות הממונה על חדלות פירעון', shortName: 'הוראות הממונה', citation: 'הוראות הממונה על חדלות פירעון', sourceType: 'guideline', procedureDomain: 'insolvency', year: null, url: 'https://www.gov.il/he/departments/policies/guideline_main' },

  // ── Basic Laws (חוקי יסוד) ───────────────────────────────────────────
  { sourceKey: 'basic_law_human_dignity_1992', titleHe: 'חוק-יסוד: כבוד האדם וחירותו', shortName: 'חו"י כבוד האדם', citation: 'חוק-יסוד: כבוד האדם וחירותו', sourceType: 'statute', procedureDomain: 'constitutional', year: 1992, wikiTitle: 'חוק-יסוד: כבוד האדם וחירותו' },
  { sourceKey: 'basic_law_freedom_occupation_1994', titleHe: 'חוק-יסוד: חופש העיסוק', shortName: 'חו"י חופש העיסוק', citation: 'חוק-יסוד: חופש העיסוק', sourceType: 'statute', procedureDomain: 'constitutional', year: 1994, wikiTitle: 'חוק-יסוד: חופש העיסוק' },
  { sourceKey: 'basic_law_judiciary_1984', titleHe: 'חוק-יסוד: השפיטה', shortName: 'חו"י השפיטה', citation: 'חוק-יסוד: השפיטה', sourceType: 'statute', procedureDomain: 'constitutional', year: 1984, wikiTitle: 'חוק-יסוד: השפיטה' },
  { sourceKey: 'basic_law_knesset_1958', titleHe: 'חוק-יסוד: הכנסת', shortName: 'חו"י הכנסת', citation: 'חוק-יסוד: הכנסת', sourceType: 'statute', procedureDomain: 'constitutional', year: 1958, wikiTitle: 'חוק-יסוד: הכנסת' },
  { sourceKey: 'basic_law_government_2001', titleHe: 'חוק-יסוד: הממשלה', shortName: 'חו"י הממשלה', citation: 'חוק-יסוד: הממשלה', sourceType: 'statute', procedureDomain: 'constitutional', year: 2001, wikiTitle: 'חוק-יסוד: הממשלה' },
  { sourceKey: 'basic_law_state_economy_1975', titleHe: 'חוק-יסוד: משק המדינה', shortName: 'חו"י משק המדינה', citation: 'חוק-יסוד: משק המדינה', sourceType: 'statute', procedureDomain: 'constitutional', year: 1975, wikiTitle: 'חוק-יסוד: משק המדינה' },
  { sourceKey: 'basic_law_judiciary_president_1964', titleHe: 'חוק-יסוד: נשיא המדינה', shortName: 'חו"י נשיא המדינה', citation: 'חוק-יסוד: נשיא המדינה', sourceType: 'statute', procedureDomain: 'constitutional', year: 1964, wikiTitle: 'חוק-יסוד: נשיא המדינה' },
  { sourceKey: 'basic_law_state_comptroller_1988', titleHe: 'חוק-יסוד: מבקר המדינה', shortName: 'חו"י מבקר המדינה', citation: 'חוק-יסוד: מבקר המדינה', sourceType: 'statute', procedureDomain: 'constitutional', year: 1988, wikiTitle: 'חוק-יסוד: מבקר המדינה' },
  { sourceKey: 'basic_law_nation_state_2018', titleHe: 'חוק-יסוד: ישראל – מדינת הלאום של העם היהודי', shortName: 'חו"י הלאום', citation: 'חוק-יסוד: ישראל – מדינת הלאום של העם היהודי', sourceType: 'statute', procedureDomain: 'constitutional', year: 2018, wikiTitle: 'חוק-יסוד: ישראל – מדינת הלאום של העם היהודי' },

  // ── Labor & Employment (דיני עבודה) ──────────────────────────────────
  { sourceKey: 'severance_pay_1963', titleHe: 'חוק פיצויי פיטורים, התשכ"ג–1963', shortName: 'חוק פיצויי פיטורים', citation: 'חוק פיצויי פיטורים, התשכ"ג–1963', sourceType: 'statute', procedureDomain: 'labor', year: 1963, wikiTitle: 'חוק פיצויי פיטורים' },
  { sourceKey: 'minimum_wage_1987', titleHe: 'חוק שכר מינימום, התשמ"ז–1987', shortName: 'חוק שכר מינימום', citation: 'חוק שכר מינימום, התשמ"ז–1987', sourceType: 'statute', procedureDomain: 'labor', year: 1987, wikiTitle: 'חוק שכר מינימום' },
  { sourceKey: 'hours_of_work_and_rest_1951', titleHe: 'חוק שעות עבודה ומנוחה, התשי"א–1951', shortName: 'חוק שעות עבודה ומנוחה', citation: 'חוק שעות עבודה ומנוחה, התשי"א–1951', sourceType: 'statute', procedureDomain: 'labor', year: 1951, wikiTitle: 'חוק שעות עבודה ומנוחה' },
  { sourceKey: 'annual_leave_1951', titleHe: 'חוק חופשה שנתית, התשי"א–1951', shortName: 'חוק חופשה שנתית', citation: 'חוק חופשה שנתית, התשי"א–1951', sourceType: 'statute', procedureDomain: 'labor', year: 1951, wikiTitle: 'חוק חופשה שנתית' },
  { sourceKey: 'wage_protection_1958', titleHe: 'חוק הגנת השכר, התשי"ח–1958', shortName: 'חוק הגנת השכר', citation: 'חוק הגנת השכר, התשי"ח–1958', sourceType: 'statute', procedureDomain: 'labor', year: 1958, wikiTitle: 'חוק הגנת השכר' },
  { sourceKey: 'equal_employment_opportunities_1988', titleHe: 'חוק שוויון ההזדמנויות בעבודה, התשמ"ח–1988', shortName: 'חוק שוויון הזדמנויות בעבודה', citation: 'חוק שוויון ההזדמנויות בעבודה, התשמ"ח–1988', sourceType: 'statute', procedureDomain: 'labor', year: 1988, wikiTitle: 'חוק שוויון ההזדמנויות בעבודה' },
  { sourceKey: 'labor_courts_1969', titleHe: 'חוק בית הדין לעבודה, התשכ"ט–1969', shortName: 'חוק בית הדין לעבודה', citation: 'חוק בית הדין לעבודה, התשכ"ט–1969', sourceType: 'statute', procedureDomain: 'labor', year: 1969, wikiTitle: 'חוק בית הדין לעבודה' },
  { sourceKey: 'womens_employment_1954', titleHe: 'חוק עבודת נשים, התשי"ד–1954', shortName: 'חוק עבודת נשים', citation: 'חוק עבודת נשים, התשי"ד–1954', sourceType: 'statute', procedureDomain: 'labor', year: 1954, wikiTitle: 'חוק עבודת נשים' },

  // ── Family (דיני משפחה) ──────────────────────────────────────────────
  { sourceKey: 'legal_capacity_guardianship_1962', titleHe: 'חוק הכשרות המשפטית והאפוטרופסות, התשכ"ב–1962', shortName: 'חוק הכשרות המשפטית', citation: 'חוק הכשרות המשפטית והאפוטרופסות, התשכ"ב–1962', sourceType: 'statute', procedureDomain: 'family', year: 1962, wikiTitle: 'חוק הכשרות המשפטית והאפוטרופסות' },
  { sourceKey: 'spousal_property_relations_1973', titleHe: 'חוק יחסי ממון בין בני זוג, התשל"ג–1973', shortName: 'חוק יחסי ממון', citation: 'חוק יחסי ממון בין בני זוג, התשל"ג–1973', sourceType: 'statute', procedureDomain: 'family', year: 1973, wikiTitle: 'חוק יחסי ממון בין בני זוג' },
  { sourceKey: 'family_law_maintenance_1959', titleHe: 'חוק לתיקון דיני המשפחה (מזונות), התשי"ט–1959', shortName: 'חוק המזונות', citation: 'חוק לתיקון דיני המשפחה (מזונות), התשי"ט–1959', sourceType: 'statute', procedureDomain: 'family', year: 1959, wikiTitle: 'חוק לתיקון דיני המשפחה (מזונות)' },
  { sourceKey: 'family_court_1995', titleHe: 'חוק בית המשפט לענייני משפחה, התשנ"ה–1995', shortName: 'חוק בית המשפט לענייני משפחה', citation: 'חוק בית המשפט לענייני משפחה, התשנ"ה–1995', sourceType: 'statute', procedureDomain: 'family', year: 1995, wikiTitle: 'חוק בית המשפט לענייני משפחה' },
  { sourceKey: 'prevention_of_family_violence_1991', titleHe: 'חוק למניעת אלימות במשפחה, התשנ"א–1991', shortName: 'חוק למניעת אלימות במשפחה', citation: 'חוק למניעת אלימות במשפחה, התשנ"א–1991', sourceType: 'statute', procedureDomain: 'family', year: 1991, wikiTitle: 'חוק למניעת אלימות במשפחה' },
  { sourceKey: 'inheritance_law_1965', titleHe: 'חוק הירושה, התשכ"ה–1965', shortName: 'חוק הירושה', citation: 'חוק הירושה, התשכ"ה–1965', sourceType: 'statute', procedureDomain: 'family', year: 1965, wikiTitle: 'חוק הירושה' },

  // ── Property, Torts & Obligations (קניין, נזיקין וחיובים) ────────────
  { sourceKey: 'land_law_1969', titleHe: 'חוק המקרקעין, התשכ"ט–1969', shortName: 'חוק המקרקעין', citation: 'חוק המקרקעין, התשכ"ט–1969', sourceType: 'statute', procedureDomain: 'civil', year: 1969, wikiTitle: 'חוק המקרקעין' },
  { sourceKey: 'tenancy_and_borrowing_1971', titleHe: 'חוק השכירות והשאילה, התשל"א–1971', shortName: 'חוק השכירות והשאילה', citation: 'חוק השכירות והשאילה, התשל"א–1971', sourceType: 'statute', procedureDomain: 'civil', year: 1971, wikiTitle: 'חוק השכירות והשאילה' },
  { sourceKey: 'unjust_enrichment_1979', titleHe: 'חוק עשיית עושר ולא במשפט, התשל"ט–1979', shortName: 'חוק עשיית עושר', citation: 'חוק עשיית עושר ולא במשפט, התשל"ט–1979', sourceType: 'statute', procedureDomain: 'civil', year: 1979, wikiTitle: 'חוק עשיית עושר ולא במשפט' },
  { sourceKey: 'gift_law_1968', titleHe: 'חוק המתנה, התשכ"ח–1968', shortName: 'חוק המתנה', citation: 'חוק המתנה, התשכ"ח–1968', sourceType: 'statute', procedureDomain: 'civil', year: 1968, wikiTitle: 'חוק המתנה' },
  { sourceKey: 'guarantee_law_1967', titleHe: 'חוק הערבות, התשכ"ז–1967', shortName: 'חוק הערבות', citation: 'חוק הערבות, התשכ"ז–1967', sourceType: 'statute', procedureDomain: 'civil', year: 1967, wikiTitle: 'חוק הערבות' },
  { sourceKey: 'agency_law_1965', titleHe: 'חוק השליחות, התשכ"ה–1965', shortName: 'חוק השליחות', citation: 'חוק השליחות, התשכ"ה–1965', sourceType: 'statute', procedureDomain: 'civil', year: 1965, wikiTitle: 'חוק השליחות' },
  { sourceKey: 'pledge_law_1967', titleHe: 'חוק המשכון, התשכ"ז–1967', shortName: 'חוק המשכון', citation: 'חוק המשכון, התשכ"ז–1967', sourceType: 'statute', procedureDomain: 'civil', year: 1967, wikiTitle: 'חוק המשכון' },
  { sourceKey: 'torts_ordinance_1968', titleHe: 'פקודת הנזיקין [נוסח חדש]', shortName: 'פקודת הנזיקין', citation: 'פקודת הנזיקין [נוסח חדש]', sourceType: 'ordinance', procedureDomain: 'civil', year: null, wikiTitle: 'פקודת הנזיקין [נוסח חדש]' },
  { sourceKey: 'defective_products_liability_1980', titleHe: 'חוק האחריות למוצרים פגומים, התש"ם–1980', shortName: 'חוק האחריות למוצרים פגומים', citation: 'חוק האחריות למוצרים פגומים, התש"ם–1980', sourceType: 'statute', procedureDomain: 'civil', year: 1980, wikiTitle: 'חוק האחריות למוצרים פגומים' },
  { sourceKey: 'limitation_law_1958', titleHe: 'חוק ההתיישנות, התשי"ח–1958', shortName: 'חוק ההתיישנות', citation: 'חוק ההתיישנות, התשי"ח–1958', sourceType: 'statute', procedureDomain: 'civil', year: 1958, wikiTitle: 'חוק ההתיישנות' },
  { sourceKey: 'standard_contracts_1982', titleHe: 'חוק החוזים האחידים, התשמ"ג–1982', shortName: 'חוק החוזים האחידים', citation: 'חוק החוזים האחידים, התשמ"ג–1982', sourceType: 'statute', procedureDomain: 'civil', year: 1982, wikiTitle: 'חוק החוזים האחידים' },
  { sourceKey: 'consumer_protection_1981', titleHe: 'חוק הגנת הצרכן, התשמ"א–1981', shortName: 'חוק הגנת הצרכן', citation: 'חוק הגנת הצרכן, התשמ"א–1981', sourceType: 'statute', procedureDomain: 'civil', year: 1981, wikiTitle: 'חוק הגנת הצרכן' },

  // ── Commercial & Companies (מסחרי ותאגידים) ──────────────────────────
  { sourceKey: 'companies_law_1999', titleHe: 'חוק החברות, התשנ"ט–1999', shortName: 'חוק החברות', citation: 'חוק החברות, התשנ"ט–1999', sourceType: 'statute', procedureDomain: 'commercial', year: 1999, wikiTitle: 'חוק החברות' },
  { sourceKey: 'companies_ordinance', titleHe: 'פקודת החברות [נוסח חדש], התשמ"ג–1983', shortName: 'פקודת החברות', citation: 'פקודת החברות [נוסח חדש], התשמ"ג–1983', sourceType: 'ordinance', procedureDomain: 'commercial', year: 1983, wikiTitle: 'פקודת החברות [נוסח חדש]' },
  { sourceKey: 'securities_law_1968', titleHe: 'חוק ניירות ערך, התשכ"ח–1968', shortName: 'חוק ניירות ערך', citation: 'חוק ניירות ערך, התשכ"ח–1968', sourceType: 'statute', procedureDomain: 'commercial', year: 1968, wikiTitle: 'חוק ניירות ערך' },
  { sourceKey: 'bills_of_exchange_ordinance', titleHe: 'פקודת השטרות [נוסח חדש]', shortName: 'פקודת השטרות', citation: 'פקודת השטרות [נוסח חדש]', sourceType: 'ordinance', procedureDomain: 'commercial', year: null, wikiTitle: 'פקודת השטרות [נוסח חדש]' },
  { sourceKey: 'partnerships_ordinance_1975', titleHe: 'פקודת השותפויות [נוסח חדש], התשל"ה–1975', shortName: 'פקודת השותפויות', citation: 'פקודת השותפויות [נוסח חדש], התשל"ה–1975', sourceType: 'ordinance', procedureDomain: 'commercial', year: 1975, wikiTitle: 'פקודת השותפויות [נוסח חדש]' },

  // ── Public & Administrative (ציבורי ומינהלי) ─────────────────────────
  { sourceKey: 'administrative_courts_2000', titleHe: 'חוק בתי משפט לעניינים מינהליים, התש"ס–2000', shortName: 'חוק בתי משפט מינהליים', citation: 'חוק בתי משפט לעניינים מינהליים, התש"ס–2000', sourceType: 'statute', procedureDomain: 'administrative', year: 2000, wikiTitle: 'חוק בתי משפט לעניינים מינהליים' },
  { sourceKey: 'interpretation_law_1981', titleHe: 'חוק הפרשנות, התשמ"א–1981', shortName: 'חוק הפרשנות', citation: 'חוק הפרשנות, התשמ"א–1981', sourceType: 'statute', procedureDomain: 'administrative', year: 1981, wikiTitle: 'חוק הפרשנות' },
  { sourceKey: 'foundations_of_law_1980', titleHe: 'חוק יסודות המשפט, התש"ם–1980', shortName: 'חוק יסודות המשפט', citation: 'חוק יסודות המשפט, התש"ם–1980', sourceType: 'statute', procedureDomain: 'administrative', year: 1980, wikiTitle: 'חוק יסודות המשפט' },
  { sourceKey: 'privacy_protection_1981', titleHe: 'חוק הגנת הפרטיות, התשמ"א–1981', shortName: 'חוק הגנת הפרטיות', citation: 'חוק הגנת הפרטיות, התשמ"א–1981', sourceType: 'statute', procedureDomain: 'administrative', year: 1981, wikiTitle: 'חוק הגנת הפרטיות' },
  { sourceKey: 'freedom_of_information_1998', titleHe: 'חוק חופש המידע, התשנ"ח–1998', shortName: 'חוק חופש המידע', citation: 'חוק חופש המידע, התשנ"ח–1998', sourceType: 'statute', procedureDomain: 'administrative', year: 1998, wikiTitle: 'חוק חופש המידע' },

  // ── Criminal — additional core (פלילי — נוספים) ─────────────────────
  { sourceKey: 'youth_adjudication_1971', titleHe: 'חוק הנוער (שפיטה, ענישה ודרכי טיפול), התשל"א–1971', shortName: 'חוק הנוער', citation: 'חוק הנוער (שפיטה, ענישה ודרכי טיפול), התשל"א–1971', sourceType: 'statute', procedureDomain: 'criminal', year: 1971, wikiTitle: 'חוק הנוער (שפיטה, ענישה ודרכי טיפול)' },
  { sourceKey: 'arrest_and_search_ordinance_1969', titleHe: 'פקודת סדר הדין הפלילי (מעצר וחיפוש) [נוסח חדש], התשכ"ט–1969', shortName: 'פקודת מעצר וחיפוש', citation: 'פקודת סדר הדין הפלילי (מעצר וחיפוש) [נוסח חדש], התשכ"ט–1969', sourceType: 'ordinance', procedureDomain: 'criminal', year: 1969, wikiTitle: 'פקודת סדר הדין הפלילי (מעצר וחיפוש) [נוסח חדש]' },
  { sourceKey: 'counter_terrorism_2016', titleHe: 'חוק המאבק בטרור, התשע"ו–2016', shortName: 'חוק המאבק בטרור', citation: 'חוק המאבק בטרור, התשע"ו–2016', sourceType: 'statute', procedureDomain: 'criminal', year: 2016, wikiTitle: 'חוק המאבק בטרור' },
];
