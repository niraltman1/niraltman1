/**
 * LegalKnowledgeService — the sole legal knowledge API used by all application
 * features: Search, AI Assistant, Drafting, Research, Citation Explorer, Analytics.
 *
 * Application features MUST NOT query datasets directly. All access goes through
 * this service via the canonical LegalDocument model.
 *
 * Architecture:
 *   Dataset → Adapter → Canonical LegalDocument → LegalKnowledgeService → App Features
 */

import { EventEmitter } from 'node:events';
import type {
  LegalDocumentRepository,
  LegalDocumentRow,
  LegalDocumentSearchHit,
  LegalDocumentStats,
  LegalDocumentType,
  VisibilityScope,
  VerdictCitationRepository,
  LegalDocumentEmbeddingRepository,
  LegalSourceRegistryRepository,
  LegalIngestionProgressRepository,
  IngestionProgressRow,
} from '@factum-il/database';
import { logger } from '@factum-il/shared';

// ── Event types ───────────────────────────────────────────────────────────

export interface CorpusProgressPayload {
  sourceId:  string;
  processed: number;
  total:     number | null;
  percent:   number | null;
  status:    string;
}

// ── Service ───────────────────────────────────────────────────────────────

export class LegalKnowledgeService extends EventEmitter {
  constructor(
    private readonly legalDocuments:       LegalDocumentRepository,
    private readonly legalSourceRegistry:  LegalSourceRegistryRepository,
    private readonly verdictCitations:     VerdictCitationRepository,
    private readonly legalEmbeddings:      LegalDocumentEmbeddingRepository,
    private readonly ingestionProgress:    LegalIngestionProgressRepository,
  ) {
    super();
  }

  // ── Document access ───────────────────────────────────────────────────

  getDocument(documentId: string): LegalDocumentRow | null {
    return this.legalDocuments.getByDocumentId(documentId);
  }

  listDocuments(opts: {
    sourceDataset?: string;
    court?:         string;
    documentType?:  LegalDocumentType;
    scope?:         VisibilityScope;
    limit?:         number;
    offset?:        number;
  } = {}): LegalDocumentRow[] {
    return this.legalDocuments.listRecent({ scope: 'PUBLIC', ...opts });
  }

  // ── Unified search ────────────────────────────────────────────────────

  search(query: string, opts: {
    court?:         string;
    sourceDataset?: string;
    documentType?:  LegalDocumentType;
    scope?:         VisibilityScope;
    limit?:         number;
  } = {}): LegalDocumentSearchHit[] {
    const q = query.trim();
    if (!q) return [];
    return this.legalDocuments.search(q, { scope: 'PUBLIC', ...opts });
  }

  // ── Citation graph ────────────────────────────────────────────────────

  getCitationsFrom(documentId: string) {
    return this.verdictCitations.listBySource(documentId);
  }

  getCitationsTo(documentId: string) {
    return this.verdictCitations.listByCited(documentId);
  }

  topCitedDocuments(limit = 20) {
    return this.verdictCitations.topCited(limit);
  }

  citationStats() {
    return this.verdictCitations.stats();
  }

  // ── Source registry ───────────────────────────────────────────────────

  listSources() {
    return this.legalSourceRegistry.list(true);
  }

  getSource(sourceId: string) {
    return this.legalSourceRegistry.getBySourceId(sourceId);
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  stats(): LegalDocumentStats {
    return this.legalDocuments.stats();
  }

  // ── Ingestion progress ────────────────────────────────────────────────

  getIngestionProgress(sourceId: string): IngestionProgressRow | null {
    return this.ingestionProgress.get(sourceId);
  }

  getAllProgress(): IngestionProgressRow[] {
    return this.ingestionProgress.listInterrupted();
  }

  // ── Semantic search (embedding-based) ────────────────────────────────

  async semanticSearch(
    query: string,
    queryEmbedding: number[],
    opts: { limit?: number; scope?: VisibilityScope } = {},
  ): Promise<Array<{ documentId: string; score: number; document: LegalDocumentRow | null }>> {
    const limit = opts.limit ?? 10;

    // Try native sqlite-vec KNN first
    const knnResults = this.legalEmbeddings.knnSearch(queryEmbedding, limit);
    if (knnResults.length > 0) {
      return knnResults.map(r => ({
        documentId: r.documentId,
        score:      1 - r.distance,
        document:   this.legalDocuments.getByDocumentId(r.documentId),
      }));
    }

    // JS cosine fallback
    const allEmbeddings = this.legalEmbeddings.allEmbeddings(2000);
    const scores = allEmbeddings
      .map(e => ({ documentId: e.documentId, score: cosineSimilarity(queryEmbedding, e.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scores.map(r => ({
      documentId: r.documentId,
      score:      r.score,
      document:   this.legalDocuments.getByDocumentId(r.documentId),
    }));
  }

  // ── Progress events ───────────────────────────────────────────────────

  emitProgress(sourceId: string, processed: number, total: number | null): void {
    const payload: CorpusProgressPayload = {
      sourceId,
      processed,
      total,
      percent: total ? Math.round((processed / total) * 100) : null,
      status:  'running',
    };
    this.emit('verdict-corpus:progress', payload);
    logger.info('[legal-knowledge] ingestion progress', {
      category: 'legal-knowledge', agentSource: 'LegalKnowledgeService', ...payload,
    });
  }

  emitStart(sourceId: string, total: number | null): void {
    this.emit('verdict-corpus:start', { sourceId, total, status: 'started' });
    logger.info('[legal-knowledge] ingestion started', {
      category: 'legal-knowledge', agentSource: 'LegalKnowledgeService', sourceId, total,
    });
  }

  emitCompleted(sourceId: string, processed: number): void {
    this.emit('verdict-corpus:completed', { sourceId, processed, status: 'completed' });
    logger.info('[legal-knowledge] ingestion completed', {
      category: 'legal-knowledge', agentSource: 'LegalKnowledgeService', sourceId, processed,
    });
  }

  emitError(sourceId: string, error: string): void {
    this.emit('verdict-corpus:error', { sourceId, error, status: 'error' });
    logger.error('[legal-knowledge] ingestion error', {
      category: 'legal-knowledge', agentSource: 'LegalKnowledgeService', sourceId, error,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na  += (a[i] ?? 0) ** 2;
    nb  += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
