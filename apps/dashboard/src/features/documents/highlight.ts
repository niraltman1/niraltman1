/**
 * Source-highlighting helper (Milestone 2 — directive Principle 2).
 * Splits OCR text into segments around case-insensitive matches of `term`, so the
 * Document Reader can <mark> the value an AI insight was extracted from. Pure +
 * unit-testable; no positional/coordinate data required.
 */
export interface HighlightSegment {
  text:  string;
  match: boolean;
}

export function splitHighlight(text: string, term: string): HighlightSegment[] {
  const trimmed = term.trim();
  if (!trimmed) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const needle = trimmed.toLowerCase();
  const segments: HighlightSegment[] = [];
  let i = 0;

  while (i <= text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      if (i < text.length) segments.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) segments.push({ text: text.slice(i, idx), match: false });
    segments.push({ text: text.slice(idx, idx + needle.length), match: true });
    i = idx + needle.length;
  }

  return segments.length ? segments : [{ text, match: false }];
}

/** True when `term` occurs in `text` (case-insensitive). */
export function hasMatch(text: string, term: string): boolean {
  const trimmed = term.trim();
  return trimmed.length > 0 && text.toLowerCase().includes(trimmed.toLowerCase());
}
