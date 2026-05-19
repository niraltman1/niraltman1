/**
 * Field Discovery — extracts structured legal metadata from raw OCR text.
 *
 * Used after OCR to auto-populate empty Case/Client DB fields:
 *   - Israeli ID numbers (תעודת זהות)
 *   - Case numbers (מספר תיק: ת"פ, ת.פ., מ.ק., etc.)
 *   - Judge names (כבוד השופט/ת ...)
 *   - Court names (בית משפט ...)
 *   - Prosecution entity (תביעה, פרקליטות, ...)
 *   - Hearing dates (תאריך דיון)
 */

export interface DiscoveredFields {
  israeliIds:        string[];
  caseNumbers:       string[];
  judgeNames:        string[];
  courtName:         string | null;
  prosecutionEntity: string | null;
  dates:             string[];    // ISO YYYY-MM-DD strings found
  investigators:     string[];
  expertWitnesses:   string[];
  coDefendants:      string[];
}

// ─── Israeli ID number ────────────────────────────────────────────────────────
// 9 digits, may have separators like dashes or spaces
const ID_RE = /\b(\d{1}[ -]?\d{4}[ -]?\d{3}[ -]?\d{1}|\d{9})\b/g;

function luhnCheck(id: string): boolean {
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(digits[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

// ─── Case number patterns ────────────────────────────────────────────────────
// Examples: ת"פ 1234/24, ת.פ. 1234-24, מ.ק. 12345/22, תת"פ 1234/24, ע"פ 123/24
const CASE_NUMBER_RE = /(?:ת["״]פ|ת\.פ\.|מ\.ק\.|ע["״]פ|ת\.ת\.פ\.|תיק\s+מס[׳']?\s*)[\s:]*([0-9]+[-/][0-9]+(?:[-/][0-9]+)?)/gi;

// ─── Judge name patterns ─────────────────────────────────────────────────────
const JUDGE_RE = /(?:כבוד|כב[׳'])?\s*(?:הש['\"]|השופט|השופטת|ס"נ|שופט)\s+([א-ת][א-ת\s"׳-]{2,30}?)(?=\s|$|[,.])/gi;

// ─── Court name ───────────────────────────────────────────────────────────────
const COURT_RE = /בית\s+(?:משפט|הדין)\s+(?:ה)?(?:שלום|מחוזי|עליון|צבאי|לתעבורה|לעניינים\s+מנהליים)(?:\s+(?:ב|ל)[א-ת\s]+)?/i;

// ─── Prosecution entity ───────────────────────────────────────────────────────
const PROSECUTION_RE = /(?:פרקליטות|תביעה\s+(?:צבאית|משטרתית|מחוז|מדינה)|משטרת\s+ישראל|ניידת\s+[א-ת]+)/i;

// ─── Additional actors ────────────────────────────────────────────────────────
const INVESTIGATOR_RE   = /(?:חוקר|חוקרת|חוקר\s+מחוז)\s+([א-ת][א-ת\s"׳-]{1,28}?)(?=\s|$|[,.])/gi;
const EXPERT_WITNESS_RE = /(?:מומחה|מומחית|עד\s+מומחה)\s+([א-ת][א-ת\s"׳-]{1,28}?)(?=\s|$|[,.])/gi;
const CO_DEFENDANT_RE   = /(?:נאשם\s+[0-9]+|שותף\s+לעבירה)\s+([א-ת][א-ת\s"׳-]{1,28}?)(?=\s|$|[,.])/gi;

// ─── Hebrew/Israeli date formats ──────────────────────────────────────────────
// DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
const DATE_RE = /\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})\b/g;

function parseHebrewDate(d: string, m: string, y: string): string | null {
  const day   = parseInt(d, 10);
  const month = parseInt(m, 10);
  let   year  = parseInt(y, 10);
  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2050) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function discoverFields(ocrText: string): DiscoveredFields {
  const text = ocrText ?? '';

  // Israeli IDs (validated with Luhn)
  const israeliIds: string[] = [];
  for (const m of text.matchAll(ID_RE)) {
    const raw = m[1]!.replace(/\D/g, '');
    if (raw.length === 9 && luhnCheck(raw) && !israeliIds.includes(raw)) {
      israeliIds.push(raw);
    }
  }

  // Case numbers
  const caseNumbers: string[] = [];
  for (const m of text.matchAll(CASE_NUMBER_RE)) {
    const cn = m[1]!.trim();
    if (!caseNumbers.includes(cn)) caseNumbers.push(cn);
  }

  // Judge names
  const judgeNames: string[] = [];
  for (const m of text.matchAll(JUDGE_RE)) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (name.length > 2 && !judgeNames.includes(name)) judgeNames.push(name);
  }

  // Court name (first match)
  const courtMatch = text.match(COURT_RE);
  const courtName  = courtMatch ? courtMatch[0].replace(/\s+/g, ' ').trim() : null;

  // Prosecution entity (first match)
  const prosMatch        = text.match(PROSECUTION_RE);
  const prosecutionEntity = prosMatch ? prosMatch[0].trim() : null;

  // Dates
  const dates: string[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const iso = parseHebrewDate(m[1]!, m[2]!, m[3]!);
    if (iso && !dates.includes(iso)) dates.push(iso);
  }

  const investigators: string[] = [];
  for (const m of text.matchAll(INVESTIGATOR_RE)) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (name.length > 1 && !investigators.includes(name)) investigators.push(name);
  }

  const expertWitnesses: string[] = [];
  for (const m of text.matchAll(EXPERT_WITNESS_RE)) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (name.length > 1 && !expertWitnesses.includes(name)) expertWitnesses.push(name);
  }

  const coDefendants: string[] = [];
  for (const m of text.matchAll(CO_DEFENDANT_RE)) {
    const name = m[1]!.trim().replace(/\s+/g, ' ');
    if (name.length > 1 && !coDefendants.includes(name)) coDefendants.push(name);
  }

  return { israeliIds, caseNumbers, judgeNames, courtName, prosecutionEntity, dates, investigators, expertWitnesses, coDefendants };
}
