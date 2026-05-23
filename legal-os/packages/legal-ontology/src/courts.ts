import type { CourtLevel } from './types.js';

export const COURT_LEVELS: readonly CourtLevel[] = [
  { id: 'supreme',    name: 'בית המשפט העליון',          rank: 1 },
  { id: 'district',   name: 'בית המשפט המחוזי',          rank: 2 },
  { id: 'magistrate', name: 'בית משפט השלום',            rank: 3 },
  { id: 'labor',      name: 'בית הדין לעבודה',           rank: 3 },
  { id: 'family',     name: 'בית משפט לענייני משפחה',   rank: 3 },
  { id: 'admin',      name: 'בית המשפט לעניינים מינהליים', rank: 2 },
];

// Maps known aliases/abbreviations → canonical court name
const COURT_ALIASES: Record<string, string> = {
  'עליון':              'בית המשפט העליון',
  'ביהמ"ש העליון':      'בית המשפט העליון',
  'בג"ץ':               'בית המשפט העליון',
  'מחוזי':              'בית המשפט המחוזי',
  'שלום':               'בית משפט השלום',
  'ביה"ד לעבודה':       'בית הדין לעבודה',
  'משפחה':              'בית משפט לענייני משפחה',
};

export function normalizeCourt(raw: string): string {
  const trimmed = raw.trim();
  if (COURT_ALIASES[trimmed]) return COURT_ALIASES[trimmed] ?? trimmed;
  for (const [alias, canonical] of Object.entries(COURT_ALIASES)) {
    if (trimmed.includes(alias)) return canonical;
  }
  return trimmed;
}

export function courtRank(canonicalName: string): number {
  return COURT_LEVELS.find(c => canonicalName.includes(c.name))?.rank ?? 99;
}
