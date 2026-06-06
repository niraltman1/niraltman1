import type { DatabaseConnection } from '../connection.js';

export interface PrecedentLibraryRow {
  id:               number;
  documentId:       number;
  sourcePath:       string;
  originalFilename: string;
  procedureType:    string | null;
  legalDomain:      string | null;
  legalQuestions:   string[];
  factualSummary:   string | null;
  keywords:         string[];
  ingestedAt:       string;
}

export interface PrecedentLibraryCreateInput {
  documentId:       number;
  sourcePath:       string;
  originalFilename: string;
  procedureType?:   string | null;
  legalDomain?:     string | null;
  legalQuestions?:  string[];
  factualSummary?:  string | null;
  keywords?:        string[];
}

function parseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

function mapRow(r: Record<string, unknown>): PrecedentLibraryRow {
  return {
    id:               r['id'] as number,
    documentId:       r['document_id'] as number,
    sourcePath:       r['source_path'] as string,
    originalFilename: r['original_filename'] as string,
    procedureType:    (r['procedure_type'] as string | null) ?? null,
    legalDomain:      (r['legal_domain'] as string | null) ?? null,
    legalQuestions:   parseArray(r['legal_questions']),
    factualSummary:   (r['factual_summary'] as string | null) ?? null,
    keywords:         parseArray(r['keywords']),
    ingestedAt:       r['ingested_at'] as string,
  };
}

export class PrecedentLibraryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  list(): PrecedentLibraryRow[] {
    return (this.db.prepare(`
      SELECT pd.*
      FROM PrecedentDocuments pd
      ORDER BY pd.ingested_at DESC
    `).all() as Record<string, unknown>[]).map(mapRow);
  }

  findById(id: number): PrecedentLibraryRow | null {
    const r = this.db
      .prepare('SELECT * FROM PrecedentDocuments WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return r ? mapRow(r) : null;
  }

  findByDocumentId(docId: number): PrecedentLibraryRow | null {
    const r = this.db
      .prepare('SELECT * FROM PrecedentDocuments WHERE document_id = ?')
      .get(docId) as Record<string, unknown> | undefined;
    return r ? mapRow(r) : null;
  }

  findBySourcePath(sourcePath: string): PrecedentLibraryRow | null {
    const r = this.db
      .prepare('SELECT * FROM PrecedentDocuments WHERE source_path = ?')
      .get(sourcePath) as Record<string, unknown> | undefined;
    return r ? mapRow(r) : null;
  }

  /** Returns the full OCR text of the original verdict for a given precedent ID. */
  getFullText(precedentId: number): { originalFilename: string; ocrText: string } | null {
    const r = this.db.prepare(`
      SELECT pd.original_filename, d.ocr_text
      FROM PrecedentDocuments pd
      JOIN Documents d ON d.id = pd.document_id
      WHERE pd.id = ?
    `).get(precedentId) as { original_filename: string; ocr_text: string | null } | undefined;
    if (!r || !r.ocr_text) return null;
    return { originalFilename: r.original_filename, ocrText: r.ocr_text };
  }

  insert(input: PrecedentLibraryCreateInput): PrecedentLibraryRow {
    const res = this.db.prepare(`
      INSERT INTO PrecedentDocuments
        (document_id, source_path, original_filename, procedure_type, legal_domain,
         legal_questions, factual_summary, keywords)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.documentId,
      input.sourcePath,
      input.originalFilename,
      input.procedureType ?? null,
      input.legalDomain   ?? null,
      JSON.stringify(input.legalQuestions ?? []),
      input.factualSummary ?? null,
      JSON.stringify(input.keywords ?? []),
    );
    return this.findById(Number(res.lastInsertRowid))!;
  }

  delete(id: number): boolean {
    const row = this.db
      .prepare('SELECT document_id FROM PrecedentDocuments WHERE id = ?')
      .get(id) as { document_id: number } | undefined;
    if (!row) return false;
    // Deleting the parent Document cascades to PrecedentDocuments, DocumentChunks, ChunkEmbeddings
    this.db.prepare('DELETE FROM Documents WHERE id = ?').run(row.document_id);
    return true;
  }
}
