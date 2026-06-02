import type { LegalSourceType } from '@factum-il/database';

/**
 * The 28 core Israeli legal sources. This is metadata only (titles, citations,
 * canonical URLs) — the verbatim text is fetched at ingest time, never authored here.
 *
 * WikiSource entries are fetched from the open, public-domain Hebrew WikiSource
 * (no ToS restriction on legislation). gov.il guideline pages are best-effort.
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
];
