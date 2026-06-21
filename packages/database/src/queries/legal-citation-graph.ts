import type { DatabaseConnection } from '../connection.js';

/** Treatment taxonomy — how a later judgment treats an earlier one. */
export type LegalTreatmentType =
  | 'cites'
  | 'followed'
  | 'applied'
  | 'approved'
  | 'distinguished'
  | 'criticized'
  | 'overruled';

const POSITIVE_TYPES: readonly LegalTreatmentType[] = ['followed', 'applied', 'approved'];
const NEGATIVE_TYPES: readonly LegalTreatmentType[] = ['distinguished', 'criticized', 'overruled'];

export interface CitationEdgeInput {
  sourceDocumentId: string;   // citing document  (LegalDocuments.document_id)
  targetDocumentId: string;   // cited document
  citationType?:    LegalTreatmentType;
}

/**
 * Authority treatment of a single cited document, derived from its inbound edges.
 * `authorityScore` is a deterministic ranking signal consumed by the reranker.
 */
export interface AuthorityTreatment {
  readonly documentId:     string;
  readonly citationCount:  number;   // total inbound edges
  readonly positiveCount:  number;   // followed + applied + approved
  readonly negativeCount:  number;   // distinguished + criticized + overruled
  readonly neutralCount:   number;   // cites
  readonly overruled:      boolean;
  readonly byType:         Record<LegalTreatmentType, number>;
  readonly authorityScore: number;
}

function emptyByType(): Record<LegalTreatmentType, number> {
  return {
    cites: 0, followed: 0, applied: 0, approved: 0,
    distinguished: 0, criticized: 0, overruled: 0,
  };
}

/**
 * Deterministic authority score from treatment counts.
 *
 *   base            = log2(1 + citationCount)   — diminishing returns on raw volume
 *   positive boost  = 1.5 × positiveCount
 *   negative penalty= 1.0 × negativeCount
 *   overruled       = −10 (precedent is no longer good law)
 *
 * A frequently-followed Supreme Court precedent therefore outscores an isolated
 * precedent, and an overruled one is pushed to the bottom. Exposed as a pure
 * function so the reranker and tests share identical math.
 */
export function computeAuthorityScore(t: {
  citationCount: number; positiveCount: number; negativeCount: number; overruled: boolean;
}): number {
  const base    = Math.log2(1 + Math.max(0, t.citationCount));
  const score   = base + 1.5 * t.positiveCount - 1.0 * t.negativeCount - (t.overruled ? 10 : 0);
  // Round to 4 dp for stable ordering / snapshot tests.
  return Math.round(score * 1e4) / 1e4;
}

/**
 * Read/write access to LegalCitationGraph (migration 087).
 *
 * Stores directed treatment edges (citing → cited) and derives per-document
 * authority signals used by retrieval reranking and the legal search UI.
 */
export class LegalCitationGraphRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** Insert a treatment edge. Idempotent on (source, target, type). */
  addCitation(input: CitationEdgeInput): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO LegalCitationGraph
        (source_document_id, target_document_id, citation_type)
      VALUES (@source, @target, @type)
    `).run({
      source: input.sourceDocumentId,
      target: input.targetDocumentId,
      type:   input.citationType ?? 'cites',
    });
  }

  /** Treatment summary + authority score for one cited document. */
  getTreatment(targetDocumentId: string): AuthorityTreatment {
    const rows = this.db.prepare(`
      SELECT citation_type AS type, COUNT(*) AS n
        FROM LegalCitationGraph
       WHERE target_document_id = ?
       GROUP BY citation_type
    `).all(targetDocumentId) as Array<{ type: LegalTreatmentType; n: number }>;

    return this.summarize(targetDocumentId, rows);
  }

  /**
   * Batch variant for reranking a result page in one query (avoids N+1).
   * Returns a map keyed by document_id; documents with no inbound edges are
   * absent (caller treats a miss as a zero-authority document).
   */
  getTreatmentBatch(targetDocumentIds: readonly string[]): Map<string, AuthorityTreatment> {
    const out = new Map<string, AuthorityTreatment>();
    if (targetDocumentIds.length === 0) return out;

    const placeholders = targetDocumentIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT target_document_id AS doc, citation_type AS type, COUNT(*) AS n
        FROM LegalCitationGraph
       WHERE target_document_id IN (${placeholders})
       GROUP BY target_document_id, citation_type
    `).all(...targetDocumentIds) as Array<{ doc: string; type: LegalTreatmentType; n: number }>;

    const grouped = new Map<string, Array<{ type: LegalTreatmentType; n: number }>>();
    for (const r of rows) {
      const list = grouped.get(r.doc) ?? [];
      list.push({ type: r.type, n: r.n });
      grouped.set(r.doc, list);
    }
    for (const [doc, list] of grouped) out.set(doc, this.summarize(doc, list));
    return out;
  }

  /** Documents that cite the given target (its inbound edges). */
  getCitingDocuments(targetDocumentId: string): Array<{ sourceDocumentId: string; citationType: LegalTreatmentType }> {
    return this.db.prepare(`
      SELECT source_document_id AS sourceDocumentId, citation_type AS citationType
        FROM LegalCitationGraph
       WHERE target_document_id = ?
       ORDER BY created_at
    `).all(targetDocumentId) as Array<{ sourceDocumentId: string; citationType: LegalTreatmentType }>;
  }

  /** Total edges in the graph — used by the corpus audit. */
  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM LegalCitationGraph').get() as { n: number }).n;
  }

  private summarize(documentId: string, rows: Array<{ type: LegalTreatmentType; n: number }>): AuthorityTreatment {
    const byType = emptyByType();
    let citationCount = 0;
    for (const r of rows) {
      byType[r.type] = r.n;
      citationCount += r.n;
    }
    const positiveCount = POSITIVE_TYPES.reduce((s, t) => s + byType[t], 0);
    const negativeCount = NEGATIVE_TYPES.reduce((s, t) => s + byType[t], 0);
    const overruled     = byType.overruled > 0;

    return {
      documentId,
      citationCount,
      positiveCount,
      negativeCount,
      neutralCount: byType.cites,
      overruled,
      byType,
      authorityScore: computeAuthorityScore({ citationCount, positiveCount, negativeCount, overruled }),
    };
  }
}
