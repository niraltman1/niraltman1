import { normalizeWhitespace, normalizeHebrew, normalizeCaseNumber, normalizePartiesSeparator } from '../hebrew/typography.js';
import { canonicalizeProcedure } from '../canonicalizers/index.js';
import { PROCEDURE_MAP } from '../abbreviations/procedures.js';

// Repair an OCR-corrupted citation string.
// Example: 'רעא 1234-21 כהן נגד מדינת ישראל' → 'רע"א 1234/21 כהן נ' מדינת ישראל'
export function repairCitation(raw: string): string {
  let s = normalizeWhitespace(raw);
  s = normalizeHebrew(s);
  s = normalizeCaseNumber(s);
  s = normalizePartiesSeparator(s);

  // Repair procedure abbreviation at start of string
  const keys = Object.keys(PROCEDURE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const canonical = PROCEDURE_MAP[key];
    if (canonical === undefined) continue;
    if (s.startsWith(key + ' ') || s === key) {
      s = canonical + s.slice(key.length);
      break;
    }
  }

  // Also attempt to repair an inline procedure surrounded by spaces
  // (handles cases where the procedure appears mid-string after context)
  s = s.replace(
    /(?<=[^א-ת]|^)(רעא|עא|עפ|בגץ|דנא|תפ|תא|עמש|תפח)(?=\s)/g,
    (match) => canonicalizeProcedure(match),
  );

  return s;
}
