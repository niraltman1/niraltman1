// Normalize dash/en-dash separator in case numbers: 1234-21 or 1234–21 → 1234/21
export function normalizeCaseNumber(raw: string): string {
  // Match: digits, optional separator, 2–4 digit year suffix (not already slash-separated)
  return raw.replace(/(\d{1,5})[-–](\d{2,4})(?![\d/])/g, '$1/$2');
}

// Format a date string to Nevo convention DD.M.YYYY (no leading zeros in day/month)
// Accepts: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
export function formatDateNevo(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${parseInt(d!, 10)}.${parseInt(m!, 10)}.${y}`;
  }
  const dmy = raw.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${parseInt(d!, 10)}.${parseInt(m!, 10)}.${y}`;
  }
  return raw;
}

// Collapse multiple whitespace characters (including   NBSP) into a single space
export function normalizeWhitespace(text: string): string {
  return text.replace(/[\s ]+/g, ' ').trim();
}

// Convert נגד (with optional surrounding whitespace) → נ'
export function normalizePartiesSeparator(text: string): string {
  return text.replace(/\s+נגד\s+/g, " נ' ");
}

// Replace Hebrew gershayim U+05F4 (״) with ASCII double-quote in abbreviations
// and geresh U+05F3 (׳) with ASCII apostrophe
export function normalizeHebrew(text: string): string {
  return text
    .normalize('NFC')
    .replace(/״/g, '"')
    .replace(/׳/g, "'");
}
