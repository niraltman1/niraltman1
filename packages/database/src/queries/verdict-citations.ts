import type { DatabaseConnection } from '../connection.js';

export type CitationType =
  | 'BGTZ' | 'CA' | 'RCA' | 'TA' | 'LAB' | 'CRIM' | 'ADMIN' | 'FAMILY' | 'OTHER';

export interface VerdictCitationInput {
  sourceDocumentId:   string;   // FDOC-XXXXXXXX
  citedDocumentId?:   string | null;
  citationText:       string;
  citationType?:      CitationType | null;
  citationNormalized?: string | null;
  confidence?:        number | null;
  contextSnippet?:    string | null;
  isSelfCite?:        boolean;
}

export interface VerdictCitationRow {
  readonly id:                 number;
  readonly sourceDocumentId:   string;
  readonly citedDocumentId:    string | null;
  readonly citationText:       string;
  readonly citationType:       CitationType | null;
  readonly citationNormalized: string | null;
  readonly confidence:         number | null;
  readonly contextSnippet:     string | null;
  readonly isSelfCite:         boolean;
  readonly isResolved:         boolean;
  readonly createdAt:          string;
}

export interface CitationGraphNode {
  readonly documentId:   string;
  readonly citationCount: number;   // times this document is cited
  readonly citeCount:    number;    // times this document cites others
}

interface RawRow {
  id: number; source_document_id: string; cited_document_id: string | null;
  citation_text: string; citation_type: string | null; citation_normalized: string | null;
  confidence: number | null; context_snippet: string | null;
  is_self_cite: number; is_resolved: number; created_at: string;
}

function toRow(r: RawRow): VerdictCitationRow {
  return {
    id:                 r.id,
    sourceDocumentId:   r.source_document_id,
    citedDocumentId:    r.cited_document_id,
    citationText:       r.citation_text,
    citationType:       r.citation_type as CitationType | null,
    citationNormalized: r.citation_normalized,
    confidence:         r.confidence,
    contextSnippet:     r.context_snippet,
    isSelfCite:         r.is_self_cite === 1,
    isResolved:         r.is_resolved === 1,
    createdAt:          r.created_at,
  };
}

export class VerdictCitationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  insert(input: VerdictCitationInput): number {
    const result = this.db.prepare(`
      INSERT INTO VerdictCitations
        (source_document_id, cited_document_id, citation_text, citation_type,
         citation_normalized, confidence, context_snippet, is_self_cite, is_resolved)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sourceDocumentId,
      input.citedDocumentId ?? null,
      input.citationText,
      input.citationType ?? null,
      input.citationNormalized ?? null,
      input.confidence ?? null,
      input.contextSnippet?.slice(0, 200) ?? null,
      input.isSelfCite ? 1 : 0,
      input.citedDocumentId ? 1 : 0,
    );
    return result.lastInsertRowid as number;
  }

  bulkInsert(inputs: VerdictCitationInput[]): number {
    let count = 0;
    this.db.transaction(() => {
      for (const input of inputs) {
        this.insert(input);
        count++;
      }
    });
    return count;
  }

  resolveCitation(id: number, citedDocumentId: string): void {
    this.db.prepare(
      'UPDATE VerdictCitations SET cited_document_id = ?, is_resolved = 1 WHERE id = ?',
    ).run(citedDocumentId, id);
  }

  listBySource(sourceDocumentId: string): VerdictCitationRow[] {
    return (this.db.prepare(
      'SELECT * FROM VerdictCitations WHERE source_document_id = ? ORDER BY id',
    ).all(sourceDocumentId) as RawRow[]).map(toRow);
  }

  listByCited(citedDocumentId: string): VerdictCitationRow[] {
    return (this.db.prepare(
      'SELECT * FROM VerdictCitations WHERE cited_document_id = ? ORDER BY id',
    ).all(citedDocumentId) as RawRow[]).map(toRow);
  }

  listUnresolved(limit = 500): VerdictCitationRow[] {
    return (this.db.prepare(
      'SELECT * FROM VerdictCitations WHERE is_resolved = 0 LIMIT ?',
    ).all(limit) as RawRow[]).map(toRow);
  }

  topCited(limit = 20): CitationGraphNode[] {
    return this.db.prepare(`
      SELECT cited_document_id as documentId,
             COUNT(*) as citationCount,
             0 as citeCount
      FROM VerdictCitations
      WHERE cited_document_id IS NOT NULL
      GROUP BY cited_document_id
      ORDER BY citationCount DESC
      LIMIT ?
    `).all(limit) as CitationGraphNode[];
  }

  stats(): { total: number; resolved: number; unresolved: number; uniqueSources: number } {
    const r = this.db.prepare(
      'SELECT COUNT(*) as total, SUM(is_resolved) as resolved, COUNT(DISTINCT source_document_id) as sources FROM VerdictCitations',
    ).get() as { total: number; resolved: number; sources: number };
    return {
      total:         r.total,
      resolved:      r.resolved ?? 0,
      unresolved:    r.total - (r.resolved ?? 0),
      uniqueSources: r.sources,
    };
  }
}
