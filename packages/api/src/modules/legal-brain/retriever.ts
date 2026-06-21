import {
  hybridSearch,
  searchLegalChunks,
  rerank,
  type RerankCandidate,
  type AuthoritySignal,
} from '@factum-il/retrieval';
import { LegalCitationGraphRepository } from '@factum-il/database';
import type { DatabaseConnection, LegalCorpusRepository } from '@factum-il/database';

export interface LegalBrainSource {
  documentId: number | string;   // numeric for client docs; FDOC-string for public corpus
  chunkText:  string;
  score:      number;
  source:     'fts' | 'vector' | 'hybrid';
  origin:     'legislation' | 'case_document' | 'precedent';
  lawName?:   string;
}

export interface RetrievalResult {
  legislation:   LegalBrainSource[];
  caseDocuments: LegalBrainSource[];
  precedents:    LegalBrainSource[];
}

const LIMIT = 5;

/**
 * Guided "think-like-a-lawyer" retrieval (audit item AI-2.6).
 *
 * Order matters: the NORMATIVE FRAMEWORK is established first (legislation), and
 * the statutes it surfaces then steer the case-law stage — precedents that apply
 * those statutes are boosted by the reranker (statutory-reference signal). Case
 * law is retrieved at CHUNK level (searchLegalChunks, AI-2.2) and reranked by
 * legal authority (citation graph), court hierarchy and recency before the top
 * results reach the prompt, rather than relying on raw fused similarity alone.
 */
export async function retrieveAllSources(
  query:       string,
  db:          DatabaseConnection,
  legalCorpus: LegalCorpusRepository,
  opts?:       { caseId?: number },
): Promise<RetrievalResult> {
  // Stage 1 — normative framework first.
  const legislation = searchLegislation(query, legalCorpus);
  // Statutes named here become reranking anchors for the case-law stage.
  const statutoryRefs = legislation
    .map((s) => s.lawName?.trim())
    .filter((n): n is string => !!n && n.length > 1);

  // Stage 2 — case law, steered by the framework above (run in parallel).
  const [caseDocuments, precedents] = await Promise.all([
    searchCaseDocuments(query, db, opts?.caseId),
    searchPrecedents(query, db, statutoryRefs),
  ]);

  return { legislation, caseDocuments, precedents };
}

function searchLegislation(query: string, legalCorpus: LegalCorpusRepository): LegalBrainSource[] {
  try {
    return legalCorpus.searchSections(query, { limit: LIMIT }).map((h): LegalBrainSource => ({
      documentId: h.id,
      chunkText:  h.verbatimText.slice(0, 400),
      score:      0.5,
      source:     'fts',
      origin:     'legislation',
      lawName:    h.titleHe,
    }));
  } catch {
    return [];
  }
}

async function searchCaseDocuments(
  query:   string,
  db:      DatabaseConnection,
  caseId?: number,
): Promise<LegalBrainSource[]> {
  try {
    const results = await hybridSearch(query, db, {
      ...(caseId !== undefined ? { caseId } : {}),
      limit: LIMIT,
    });
    return results.map((r): LegalBrainSource => ({
      documentId: r.documentId,
      chunkText:  r.chunkText.slice(0, 400),
      score:      r.score,
      source:     r.source,
      origin:     'case_document',
    }));
  } catch {
    return [];
  }
}

/**
 * Public-corpus case law (verdicts), chunk-level + reranked by legal authority.
 * Over-fetches a candidate page, applies the citation-graph / court / recency
 * rerank biased toward statutes from the normative framework, then keeps top-N.
 */
async function searchPrecedents(
  query:         string,
  db:            DatabaseConnection,
  statutoryRefs: readonly string[],
): Promise<LegalBrainSource[]> {
  try {
    const hits = await searchLegalChunks(query, db, { limit: LIMIT * 4 });
    if (hits.length === 0) return [];

    const docIds = [...new Set(hits.map((h) => h.documentId))];
    const authorityById = buildAuthorityMap(db, docIds);
    const metaById      = fetchDocMeta(db, docIds);

    const candidates: RerankCandidate[] = hits.map((h) => {
      const meta = metaById.get(h.documentId);
      return {
        id:        h.documentId,
        score:     h.score,
        text:      h.chunkText,
        isStatute: false,
        ...(meta?.court !== undefined ? { court: meta.court } : {}),
        ...(meta?.year  !== undefined ? { year:  meta.year } : {}),
      };
    });

    const ranked = rerank(candidates, {
      authorityById,
      ...(statutoryRefs.length > 0 ? { statutoryRefs } : {}),
    });

    // Preserve the chunk text for each reranked candidate.
    const textById = new Map(hits.map((h) => [h.documentId, h.chunkText]));
    const sourceById = new Map(hits.map((h) => [h.documentId, h.source]));

    return ranked.slice(0, LIMIT).map((r): LegalBrainSource => ({
      documentId: r.id,
      chunkText:  (textById.get(r.id) ?? r.text ?? '').slice(0, 400),
      score:      r.finalScore,
      source:     sourceById.get(r.id) ?? 'hybrid',
      origin:     'precedent',
    }));
  } catch {
    return [];
  }
}

/** Citation-graph authority signals for the candidate documents (batch, no N+1). */
function buildAuthorityMap(
  db:     DatabaseConnection,
  docIds: readonly string[],
): Map<string, AuthoritySignal> {
  const out = new Map<string, AuthoritySignal>();
  try {
    const graph = new LegalCitationGraphRepository(db);
    const treatments = graph.getTreatmentBatch(docIds);
    for (const [id, t] of treatments) {
      out.set(id, { authorityScore: t.authorityScore, overruled: t.overruled });
    }
  } catch {
    // Citation graph unavailable — reranker treats every doc as zero-authority.
  }
  return out;
}

/** Court + year for the candidate documents, used for court/recency reranking. */
function fetchDocMeta(
  db:     DatabaseConnection,
  docIds: readonly string[],
): Map<string, { court?: string; year?: number }> {
  const out = new Map<string, { court?: string; year?: number }>();
  if (docIds.length === 0) return out;
  try {
    const placeholders = docIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT document_id, court, date
        FROM LegalDocuments
       WHERE document_id IN (${placeholders})
    `).all(...docIds) as Array<{ document_id: string; court: string | null; date: string | null }>;
    for (const r of rows) {
      const yearMatch = r.date?.match(/(\d{4})/);
      out.set(r.document_id, {
        ...(r.court ? { court: r.court } : {}),
        ...(yearMatch ? { year: Number(yearMatch[1]) } : {}),
      });
    }
  } catch {
    // LegalDocuments metadata unavailable — court/recency boosts simply absent.
  }
  return out;
}
