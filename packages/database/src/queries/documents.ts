import type { DatabaseConnection } from '../connection.js';
import type { Document, DocumentCreateInput, PaginatedResult, DocumentSearchResult } from '@factum-il/shared';

export class DocumentRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findById(id: number): Document | null {
    const row = this.db
      .prepare('SELECT * FROM Documents WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByHash(hash: string): Document | null {
    const row = this.db
      .prepare('SELECT * FROM Documents WHERE file_hash = ?')
      .get(hash) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  create(input: DocumentCreateInput): Document {
    const stmt = this.db.prepare(`
      INSERT INTO Documents
        (file_hash, original_path, storage_path, filename, extension, file_size_bytes, mime_type, language, client_id, case_id)
      VALUES
        (@fileHash, @originalPath, @storagePath, @filename, @extension, @fileSizeBytes, @mimeType, @language, @clientId, @caseId)
    `);

    const result = stmt.run({
      fileHash:      input.fileHash,
      originalPath:  input.originalPath,
      storagePath:   input.storagePath,
      filename:      input.filename,
      extension:     input.extension,
      fileSizeBytes: input.fileSizeBytes,
      mimeType:      input.mimeType  ?? null,
      language:      input.language  ?? 'he',
      clientId:      input.clientId  ?? null,
      caseId:        input.caseId    ?? null,
    }) as { lastInsertRowid: number | bigint };

    return this.findById(Number(result.lastInsertRowid))!;
  }

  list(opts: { page?: number; pageSize?: number } = {}): PaginatedResult<Document> {
    const page     = opts.page     ?? 1;
    const pageSize = opts.pageSize ?? 50;
    const offset   = (page - 1) * pageSize;

    const total = (this.db.prepare('SELECT COUNT(*) as count FROM Documents').get() as { count: number }).count;
    const rows  = this.db.prepare('SELECT * FROM Documents ORDER BY created_at DESC LIMIT ? OFFSET ?').all(pageSize, offset) as Record<string, unknown>[];

    return {
      items:       rows.map((r) => this.mapRow(r)),
      total,
      page,
      pageSize,
      hasNextPage: offset + pageSize < total,
    };
  }

  setOcrText(id: number, text: string): void {
    this.db.prepare(`
      UPDATE Documents
         SET ocr_text        = @text,
             processing_state = 'complete',
             updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = @id
    `).run({ id, text });
  }

  updateStoragePath(id: number, storagePath: string, filename: string): void {
    this.db.prepare(`
      UPDATE Documents
      SET storage_path = @storagePath,
          filename     = @filename,
          updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `).run({ id, storagePath, filename });
  }

  search(query: string, limit = 50): DocumentSearchResult[] {
    const rows = this.db.prepare(`
      SELECT d.*, fts.rank
        FROM fts_documents fts
        JOIN Documents d ON d.id = fts.rowid
       WHERE fts_documents MATCH ?
       ORDER BY fts.rank
       LIMIT ?
    `).all(query, limit) as (Record<string, unknown> & { rank: number })[];

    return rows.map((r) => ({
      document: this.mapRow(r),
      rank:     r['rank'] as number,
      snippet:  '',
    }));
  }

  listReviewPending(): Array<Record<string, unknown>> {
    return this.db.prepare(`
      SELECT d.id, d.filename, d.ocr_text, d.document_type, d.processing_state, d.created_at,
             di.case_number  AS ai_case_number,
             di.court_name   AS ai_court_name,
             di.judge_name   AS ai_judge_name,
             di.offense_type AS ai_offense_type,
             di.next_hearing AS ai_next_hearing,
             di.confidence   AS ai_confidence
        FROM Documents d
        LEFT JOIN DocumentInsights di ON di.document_id = d.id
       WHERE d.processing_state = 'REVIEW_PENDING'
       ORDER BY d.created_at DESC
    `).all() as Array<Record<string, unknown>>;
  }

  findInsights(documentId: number): Record<string, unknown> | null {
    return (this.db.prepare(
      'SELECT * FROM DocumentInsights WHERE document_id = ?',
    ).get(documentId) as Record<string, unknown> | undefined) ?? null;
  }

  private mapRow(row: Record<string, unknown>): Document {
    return {
      id:              row['id'] as number,
      fileHash:        row['file_hash'] as string,
      originalPath:    row['original_path'] as string,
      storagePath:     row['storage_path'] as string,
      filename:        row['filename'] as string,
      extension:       row['extension'] as string,
      fileSizeBytes:   row['file_size_bytes'] as number,
      mimeType:        (row['mime_type'] as string | null),
      caseId:          (row['case_id'] as number | null),
      clientId:        (row['client_id'] as number | null),
      documentType:    (row['document_type'] as string | null) as Document['documentType'],
      documentDate:    (row['document_date'] as string | null),
      language:        (row['language'] as Document['language']) ?? 'he',
      ocrText:         (row['ocr_text'] as string | null),
      ocrConfidence:   (row['ocr_confidence'] as number | null),
      processingState: row['processing_state'] as Document['processingState'],
      pageCount:       (row['page_count'] as number | null),
      isDuplicate:     (row['is_duplicate'] as number) === 1,
      duplicateOf:     (row['duplicate_of'] as number | null),
      tags:            row['tags'] ? JSON.parse(row['tags'] as string) as string[] : [],
      createdAt:       row['created_at'] as string,
      updatedAt:       row['updated_at'] as string,
    };
  }
}
