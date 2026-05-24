import type { CitationSource, CaseCitation } from '../schemas/types.js';
import { PROCEDURE_MAP, PUBLICATION_MAP } from '../abbreviations/procedures.js';
import { canonicalizeProcedure } from '../canonicalizers/index.js';
import { normalizeHebrew, normalizeCaseNumber, normalizePartiesSeparator, formatDateNevo } from '../hebrew/typography.js';

// Build a regex that matches any known procedure abbreviation (canonical + OCR variants)
const procedureAlternatives = Object.keys(PROCEDURE_MAP)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

// Full case citation pattern:
// {procedure} {number} {party} נ' {party} ({publication} {date})
// or simpler forms without parties/publication
const CASE_CITATION_RE = new RegExp(
  `(${procedureAlternatives})` +       // group 1: procedure
  `\\s+([\\d]{1,5}[/\\-–][\\d]{2,4})` + // group 2: case number
  `(?:\\s+([^\\(\\n]{2,60}?))?` +      // group 3: parties (optional, non-greedy)
  `(?:\\s*\\(([^\\)]{1,30})\\))?`,     // group 4: publication+date in parens (optional)
  'u',
);

// Scan a full OCR text block for all citation matches
const SCAN_RE = new RegExp(
  `(${procedureAlternatives})` +
  `\\s+([\\d]{1,5}[/\\-–][\\d]{2,4})` +
  `(?:\\s+([^\\(\\n,;]{2,60}?))?` +
  `(?:\\s*\\(([^\\)]{1,40})\\))?`,
  'gu',
);

function extractParties(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  const normalized = normalizePartiesSeparator(raw.trim());
  // Split on נ' separator
  const parts = normalized.split(/\s+נ'?\s+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function extractPublication(raw: string | undefined): { publication?: string; date?: string } {
  if (!raw) return {};
  const trimmed = raw.trim();

  // Try to split: "נבו 11.3.2021" or "פ"ד עה(2) 100"
  const dateMatch = trimmed.match(/^(.+?)\s+(\d{1,2}\.\d{1,2}\.\d{4})$/);
  if (dateMatch) {
    const pubRaw = dateMatch[1]!.trim();
    const pub    = PUBLICATION_MAP[pubRaw] ?? pubRaw;
    const date   = dateMatch[2];
    return date !== undefined
      ? { publication: pub, date }
      : { publication: pub };
  }

  // ISO date
  const isoMatch = trimmed.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})$/);
  if (isoMatch) {
    const pubRaw = isoMatch[1]!.trim();
    const pub    = PUBLICATION_MAP[pubRaw] ?? pubRaw;
    const rawDate = isoMatch[2];
    return rawDate !== undefined
      ? { publication: pub, date: formatDateNevo(rawDate) }
      : { publication: pub };
  }

  // Just a publication name with no date
  const pub = PUBLICATION_MAP[trimmed] ?? trimmed;
  return { publication: pub };
}

// Parse a single raw citation string → structured CaseCitation or null
export function parseCitation(raw: string): CitationSource | null {
  const normalized = normalizeHebrew(normalizeCaseNumber(raw.trim()));
  const m = CASE_CITATION_RE.exec(normalized);
  if (!m) return null;

  const procedure = canonicalizeProcedure(m[1] ?? '');
  const number    = normalizeCaseNumber(m[2] ?? '');
  const parties   = extractParties(m[3]);
  const { publication, date } = extractPublication(m[4]);

  const citation: CaseCitation = {
    type: 'case',
    procedure,
    number,
    parties,
    ...(publication !== undefined ? { publication } : {}),
    ...(date       !== undefined ? { date }        : {}),
  };

  return citation;
}

export interface ExtractedCitation {
  readonly citation: CitationSource;
  readonly rawMatch: string;
  readonly index: number;
}

// Extract all citations from a long OCR text block
export function extractCitations(text: string): ExtractedCitation[] {
  const results: ExtractedCitation[] = [];
  const normalized = normalizeHebrew(text);

  SCAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCAN_RE.exec(normalized)) !== null) {
    const rawMatch = m[0];
    const parsed   = parseCitation(rawMatch);
    if (parsed) {
      results.push({ citation: parsed, rawMatch, index: m.index });
    }
  }

  return results;
}
