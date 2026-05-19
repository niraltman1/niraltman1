import type { CaseCitation } from '../schemas/types.js';

// Format a case citation per Nevo Unified Citation Rules 2021.
// Output: {procedure} {number} {party1} נ' {party2} ({publication} {date})
export function formatCase(c: CaseCitation): string {
  const partiesPart = formatParties(c.parties);
  const pubPart     = formatPublication(c.publication, c.volume, c.page, c.date);

  const parts: string[] = [c.procedure, c.number];
  if (partiesPart) parts.push(partiesPart);
  if (pubPart)     parts.push(pubPart);

  return parts.join(' ');
}

function formatParties(parties: readonly string[]): string {
  if (parties.length === 0) return '';
  if (parties.length === 1) return parties[0] ?? '';
  return `${parties[0]} נ' ${parties[1]}`;
}

function formatPublication(
  publication: string | undefined,
  volume: string | undefined,
  page: string | undefined,
  date: string | undefined,
): string {
  if (!publication && !date) return '';

  const inner: string[] = [];
  if (publication) inner.push(publication);
  if (volume)      inner.push(volume);
  if (page)        inner.push(page);
  if (date)        inner.push(date);

  return inner.length > 0 ? `(${inner.join(' ')})` : '';
}
