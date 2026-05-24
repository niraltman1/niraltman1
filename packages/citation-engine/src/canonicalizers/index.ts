import { PROCEDURE_MAP } from '../abbreviations/procedures.js';
import {
  normalizeWhitespace,
  normalizeHebrew,
  normalizeCaseNumber,
  normalizePartiesSeparator,
} from '../hebrew/typography.js';

// Resolve a raw procedure string to its canonical Nevo 2021 form.
// Returns the input unchanged if not found in the map.
export function canonicalizeProcedure(raw: string): string {
  const normalized = normalizeHebrew(raw.trim());
  return PROCEDURE_MAP[normalized] ?? normalized;
}

// Normalize a full raw citation string for storage and deduplication.
// Does NOT apply display formatting — use formatters for that.
export function canonicalizeCitation(raw: string): string {
  let s = normalizeWhitespace(raw);
  s = normalizeHebrew(s);
  s = normalizeCaseNumber(s);
  s = normalizePartiesSeparator(s);

  // Replace each occurrence of a procedure that appears in PROCEDURE_MAP
  // We sort keys by descending length to match longer entries first (e.g. 'רע"א' before 'ע"א')
  const keys = Object.keys(PROCEDURE_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const canonical = PROCEDURE_MAP[key];
    if (canonical === undefined) continue;
    if (s.startsWith(key + ' ') || s === key) {
      s = canonical + s.slice(key.length);
      break;
    }
  }

  return s;
}
