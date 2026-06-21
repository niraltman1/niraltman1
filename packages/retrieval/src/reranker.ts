/**
 * Multi-stage legal re-ranker (Task 2.4).
 *
 * Upstream stages (vector retrieval → FTS → Reciprocal Rank Fusion) already run
 * in hybridSearch() / searchLegalSections(). This module is the final stage: it
 * re-orders the fused candidates using legal-domain authority so that the most
 * legally weighty results reach the top of the context window — not merely the
 * most lexically/semantically similar ones.
 *
 * Design notes:
 *  - The legal-weighting pass (`rerank`) is PURE and synchronous, so it is fully
 *    deterministic and unit-testable without Ollama.
 *  - An optional cross-encoder stage (`rerankWithCrossEncoder`) injects a scorer
 *    (e.g. a local law-il-E2B call). When absent, ranking degrades gracefully to
 *    the deterministic legal weighting — never crashing, never going remote.
 *  - Authority comes from the LegalCitationGraph (computeAuthorityScore); this
 *    module only consumes it, keeping the graph the single source of truth.
 */

/** Authority signal for one document, as produced by LegalCitationGraphRepository. */
export interface AuthoritySignal {
  readonly authorityScore: number;
  readonly overruled:      boolean;
}

export interface RerankCandidate {
  /** Stable id used to look up authority (LegalDocuments.document_id, source_key, …). */
  readonly id:               string;
  /** Upstream fused score (RRF / similarity). Higher is better. */
  readonly score:            number;
  readonly court?:           string;       // e.g. 'עליון' | 'מחוזי' | 'שלום'
  readonly year?:            number;
  readonly judges?:          readonly string[];
  readonly procedureDomain?: string;
  readonly isStatute?:       boolean;      // legislation section vs case law
  readonly text?:            string;       // verbatim text, for statutory-ref matching
}

export interface RerankContext {
  /** Per-document authority from the citation graph (miss ⇒ zero authority). */
  readonly authorityById?:          ReadonlyMap<string, AuthoritySignal>;
  readonly preferredProcedureDomain?: string;
  readonly preferredJudge?:         string;
  /** Exact statutory references parsed from the query, e.g. ['סעיף 12', 'חוק החוזים']. */
  readonly statutoryRefs?:          readonly string[];
  /** Reference year for recency scoring (defaults to current calendar year). */
  readonly currentYear?:            number;
}

export interface RerankFactors {
  readonly base:             number;
  readonly authority:        number;
  readonly courtBoost:       number;
  readonly recency:          number;
  readonly statutory:        number;
  readonly judge:            number;
  readonly procedure:        number;
  readonly overruledPenalty: number;
}

export interface RerankedResult extends RerankCandidate {
  readonly finalScore: number;
  readonly factors:    RerankFactors;
}

// ── Weights (deterministic; documented so callers can reason about ordering) ──
const W = {
  base:      1.0,
  authority: 0.5,   // × authorityScore (log-scaled volume + treatment)
  court:     1.0,   // × courtRank
  recency:   1.0,   // × recencyFraction (0..1 over RECENCY_WINDOW years)
  statutory: 2.0,   // exact statutory reference present in candidate text
  judge:     1.0,   // preferred judge sits on the panel
  procedure: 0.75,  // procedure-domain match
  overruled: 12.0,  // hard penalty — overruled precedent is no longer good law
} as const;

const RECENCY_WINDOW = 30; // years over which recency decays to 0

/** Court hierarchy boost: higher courts carry more precedential weight. */
function courtRank(court: string | undefined): number {
  if (!court) return 0;
  if (court.includes('עליון')) return 1.0;   // Supreme
  if (court.includes('מחוזי')) return 0.6;   // District
  if (court.includes('עבודה')) return 0.5;   // Labour
  if (court.includes('שלום'))  return 0.3;   // Magistrate
  return 0.2;
}

function recencyFraction(year: number | undefined, currentYear: number): number {
  if (!year || year > currentYear) return 0;
  const age = currentYear - year;
  if (age >= RECENCY_WINDOW) return 0;
  return (RECENCY_WINDOW - age) / RECENCY_WINDOW; // 1.0 (this year) → 0.0 (≥30y)
}

function statutoryMatch(text: string | undefined, refs: readonly string[] | undefined): number {
  if (!text || !refs || refs.length === 0) return 0;
  return refs.some((r) => r.trim() !== '' && text.includes(r.trim())) ? 1 : 0;
}

function judgeMatch(judges: readonly string[] | undefined, preferred: string | undefined): number {
  if (!judges || !preferred) return 0;
  return judges.some((j) => j.includes(preferred) || preferred.includes(j)) ? 1 : 0;
}

/**
 * Deterministic legal-weighting rerank. Returns a NEW array sorted by finalScore
 * descending; ties fall back to the upstream score for stable ordering.
 */
export function rerank(
  candidates: readonly RerankCandidate[],
  context: RerankContext = {},
): RerankedResult[] {
  const currentYear = context.currentYear ?? new Date().getFullYear();

  const scored = candidates.map((c): RerankedResult => {
    const authoritySignal = context.authorityById?.get(c.id);
    const authorityScore  = authoritySignal?.authorityScore ?? 0;
    const overruled       = authoritySignal?.overruled ?? false;

    const factors: RerankFactors = {
      base:             W.base * c.score,
      authority:        W.authority * authorityScore,
      courtBoost:       W.court * courtRank(c.court),
      recency:          W.recency * recencyFraction(c.year, currentYear),
      statutory:        W.statutory * statutoryMatch(c.text, context.statutoryRefs),
      judge:            W.judge * judgeMatch(c.judges, context.preferredJudge),
      procedure:        c.procedureDomain && context.preferredProcedureDomain &&
                          c.procedureDomain === context.preferredProcedureDomain
                            ? W.procedure : 0,
      overruledPenalty: overruled ? -W.overruled : 0,
    };

    const finalScore =
      factors.base + factors.authority + factors.courtBoost + factors.recency +
      factors.statutory + factors.judge + factors.procedure + factors.overruledPenalty;

    return { ...c, finalScore: Math.round(finalScore * 1e4) / 1e4, factors };
  });

  return scored.sort((a, b) => (b.finalScore - a.finalScore) || (b.score - a.score));
}

/**
 * Optional cross-encoder stage. `crossEncoder` returns a relevance score in
 * [0,1] for (query, candidateText); it is blended into the candidate's base
 * score before the deterministic legal weighting. When the scorer is absent or
 * throws (e.g. Ollama down), we fall back to plain `rerank` — never remote,
 * never crashing.
 */
export async function rerankWithCrossEncoder(
  query: string,
  candidates: readonly RerankCandidate[],
  context: RerankContext = {},
  crossEncoder?: (query: string, text: string) => Promise<number>,
): Promise<RerankedResult[]> {
  if (!crossEncoder) return rerank(candidates, context);

  const blended: RerankCandidate[] = [];
  for (const c of candidates) {
    let ceScore = 0;
    try {
      ceScore = c.text ? await crossEncoder(query, c.text) : 0;
    } catch {
      ceScore = 0; // scorer unavailable — degrade to upstream score only
    }
    // Blend: keep upstream signal, add a bounded cross-encoder contribution.
    blended.push({ ...c, score: c.score + Math.max(0, Math.min(1, ceScore)) });
  }
  return rerank(blended, context);
}
