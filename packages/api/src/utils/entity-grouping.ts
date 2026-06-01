import type { EntityReference } from '@factum-il/database';

/**
 * Pure normalization + grouping for Entity-Centric Navigation (M6).
 * Groups raw judge/court references by their canonical (honorific-stripped /
 * alias-normalized) form. The normalize function is injected (normalizeJudge /
 * normalizeCourt from @factum-il/legal-ontology) so this stays pure + testable.
 */

export interface EntitySummary {
  canonical:     string;
  displayName:   string;   // a representative raw form
  hearingCount:  number;
  documentCount: number;
  caseCount:     number;   // distinct cases
}

export interface EntityDetail extends EntitySummary {
  references: EntityReference[];
}

function canonicalize(name: string, normalize: (s: string) => string): string {
  const c = normalize(name).trim();
  return c.length > 0 ? c : name.trim();
}

/** Summaries for every distinct entity, sorted by total references desc. */
export function summarizeEntities(
  refs: EntityReference[],
  normalize: (s: string) => string,
): EntitySummary[] {
  const map = new Map<string, { display: string; hearings: number; docs: number; cases: Set<number> }>();
  for (const r of refs) {
    const key = canonicalize(r.name, normalize);
    let g = map.get(key);
    if (!g) { g = { display: r.name.trim(), hearings: 0, docs: 0, cases: new Set() }; map.set(key, g); }
    if (r.kind === 'hearing') g.hearings += 1; else g.docs += 1;
    if (r.caseId != null) g.cases.add(r.caseId);
  }
  return [...map.entries()]
    .map(([canonical, g]) => ({
      canonical, displayName: g.display,
      hearingCount: g.hearings, documentCount: g.docs, caseCount: g.cases.size,
    }))
    .sort((a, b) => (b.hearingCount + b.documentCount) - (a.hearingCount + a.documentCount));
}

/** Full detail (summary + references) for one canonical entity. */
export function entityDetail(
  refs: EntityReference[],
  canonical: string,
  normalize: (s: string) => string,
): EntityDetail {
  const matching = refs.filter((r) => canonicalize(r.name, normalize) === canonical);
  const [summary] = summarizeEntities(matching, normalize);
  return {
    canonical,
    displayName:   summary?.displayName ?? canonical,
    hearingCount:  summary?.hearingCount ?? 0,
    documentCount: summary?.documentCount ?? 0,
    caseCount:     summary?.caseCount ?? 0,
    references:    matching,
  };
}
