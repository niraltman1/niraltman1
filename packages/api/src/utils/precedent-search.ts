/**
 * Precedent context search — FTS5 query over DocumentChunks filtered to
 * document_type='precedent', enriched with structured metadata from PrecedentDocuments.
 *
 * Used by the RAG worker to build context-aware legal prompts.
 * Each result carries precedentId so the model can cite it and the UI can link to the full verdict.
 */

import type { DatabaseConnection } from '@factum-il/database';
import { logger } from '@factum-il/shared';

export interface PrecedentContextResult {
  precedentId:      number;   // PrecedentDocuments.id — used for full-text lookup + citations
  documentId:       number;   // Documents.id
  originalFilename: string;
  procedureType:    string | null;
  legalDomain:      string | null;
  legalQuestions:   string[];
  factualSummary:   string | null;
  keywords:         string[];
  chunkText:        string;   // best-matching chunk (fallback context if metadata is sparse)
}

function parseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

/** Strip characters that break FTS5 query syntax while preserving Hebrew Unicode. */
function sanitizeFtsQuery(q: string): string {
  // Keep ASCII printable (0x20-0x7E), Hebrew Unicode block (0x0590-0x05FF),
  // and Hebrew presentation forms (0xFB1D-0xFB4E). Explicit hex escapes avoid
  // the suspicious-range overlap between \s and the space in a char-class range.
  return q
    .replace(/[^\x20-\x7E\u0590-\u05FF\uFB1D-\uFB4E]/g, ' ')
    .replace(/["*^()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function searchPrecedentContext(
  query:  string,
  db:     DatabaseConnection,
  limit = 3,
): PrecedentContextResult[] {
  const safeQuery = sanitizeFtsQuery(query);
  if (!safeQuery) return [];

  try {
    const rows = db.prepare(`
      SELECT pd.id          AS precedentId,
             d.id           AS documentId,
             d.filename     AS originalFilename,
             pd.procedure_type,
             pd.legal_domain,
             pd.legal_questions,
             pd.factual_summary,
             pd.keywords,
             dc.chunk_text
      FROM fts_document_chunks fts
      JOIN DocumentChunks dc    ON dc.id           = fts.rowid
      JOIN Documents d          ON d.id            = dc.document_id
      JOIN PrecedentDocuments pd ON pd.document_id = d.id
      WHERE fts_document_chunks MATCH ?
        AND d.document_type = 'precedent'
      ORDER BY rank
      LIMIT ?
    `).all(safeQuery, limit) as Record<string, unknown>[];

    return rows.map((r) => ({
      precedentId:      r['precedentId']      as number,
      documentId:       r['documentId']       as number,
      originalFilename: r['originalFilename'] as string,
      procedureType:    (r['procedure_type']  as string | null) ?? null,
      legalDomain:      (r['legal_domain']    as string | null) ?? null,
      legalQuestions:   parseArray(r['legal_questions']),
      factualSummary:   (r['factual_summary'] as string | null) ?? null,
      keywords:         parseArray(r['keywords']),
      chunkText:        r['chunk_text']       as string,
    }));
  } catch (err) {
    logger.warn(`Precedent FTS search failed: ${String(err)}`, { category: 'ai' });
    return [];
  }
}

/**
 * Formats precedent results as a Hebrew context block for injection into the RAG prompt.
 * Each entry is explicitly cited with its DB ID so the model can reference it
 * and the UI can resolve it to a clickable full-text link.
 */
export function formatPrecedentContext(results: PrecedentContextResult[]): string {
  if (results.length === 0) return '';

  const parts = results.map((r) => {
    const lines: string[] = [
      `[Source ID: ${r.precedentId}] - File: ${r.originalFilename}`,
    ];
    if (r.legalDomain)   lines.push(`תחום: ${r.legalDomain}`);
    if (r.procedureType) lines.push(`סוג הליך: ${r.procedureType}`);
    if (r.legalQuestions.length > 0) {
      lines.push(`שאלות משפטיות: ${r.legalQuestions.join('; ')}`);
    }
    if (r.factualSummary) {
      lines.push(`סיכום עובדתי: ${r.factualSummary}`);
    }
    return lines.join('\n');
  });

  return `להלן פסקי דין דומים שנדונו בהם שאלות משפטיות רלוונטיות:\n\n${parts.join('\n---\n')}\n\n---`;
}
