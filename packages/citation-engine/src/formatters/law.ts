import type { LawCitation, RegulationCitation } from '../schemas/types.js';

// Format a law citation per Nevo Unified Citation Rules 2021.
// Output: {name}, {publication}-{year}, סעיף {section}
// Example: חוק העונשין, התשל"ז-1977, סעיף 300
export function formatLaw(c: LawCitation): string {
  const parts: string[] = [c.name];
  if (c.publication) {
    parts.push(`${c.publication}-${c.year}`);
  } else {
    parts.push(String(c.year));
  }
  if (c.section) {
    parts.push(`סעיף ${c.section}`);
  }
  return parts.join(', ');
}

// Format a regulation citation per Nevo 2021.
// Output: {name}, {publication}-{year}, תקנה {regulation}
export function formatRegulation(c: RegulationCitation): string {
  const parts: string[] = [c.name];
  if (c.publication) {
    parts.push(`${c.publication}-${c.year}`);
  } else {
    parts.push(String(c.year));
  }
  if (c.regulation) {
    parts.push(`תקנה ${c.regulation}`);
  }
  return parts.join(', ');
}
