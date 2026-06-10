import { hybridSearch } from '@factum-il/retrieval';
import type { DatabaseConnection, LegalCorpusRepository } from '@factum-il/database';

export interface LegalBrainSource {
  documentId: number;
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

export async function retrieveAllSources(
  query:       string,
  db:          DatabaseConnection,
  legalCorpus: LegalCorpusRepository,
  opts?:       { caseId?: number },
): Promise<RetrievalResult> {
  const [legislation, caseDocuments, precedents] = await Promise.all([
    Promise.resolve(searchLegislation(query, legalCorpus)),
    searchCaseDocuments(query, db, opts?.caseId),
    Promise.resolve(searchPrecedentChunks(query, db)),
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

function searchPrecedentChunks(query: string, db: DatabaseConnection): LegalBrainSource[] {
  const ftsQuery = query.replace(/['"*]/g, ' ').trim();
  if (!ftsQuery) return [];
  try {
    interface PRow { id: number; document_id: number; chunk_text: string; }
    const rows = db.prepare(`
      SELECT dc.id, dc.document_id, dc.chunk_text
      FROM fts_document_chunks fts
      JOIN DocumentChunks dc ON dc.id = fts.rowid
      JOIN Documents d ON d.id = dc.document_id
      WHERE fts_document_chunks MATCH ? AND d.document_type = 'precedent'
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, LIMIT) as PRow[];
    return rows.map((r, idx): LegalBrainSource => ({
      documentId: r.document_id,
      chunkText:  r.chunk_text.slice(0, 400),
      score:      1 / (60 + idx + 1),
      source:     'fts',
      origin:     'precedent',
    }));
  } catch {
    return [];
  }
}
