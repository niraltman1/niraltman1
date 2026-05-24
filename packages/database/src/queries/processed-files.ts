import type { DatabaseConnection } from '../connection.js';

export interface ProcessedFile {
  readonly id:                 number;
  readonly fileHash:           string;
  readonly originalPath:       string;
  readonly currentPath:        string;
  readonly originalName:       string;
  readonly convertedPdfPath:   string | null;
  readonly fileSizeBytes:      number | null;
  readonly mimeType:           string | null;
  readonly processingStatus:   'pending' | 'hashing' | 'converting' | 'ocr' | 'complete' | 'failed' | 'skipped';
  readonly skipReason:         string | null;
  readonly ocrTextPreview:     string | null;
  readonly documentId:         number | null;
  readonly clientId:           number | null;
  readonly metadataJson:       string | null;
  readonly lastScanned:        string;
  readonly createdAt:          string;
  readonly updatedAt:          string;
}

export interface RegisterInput {
  fileHash:         string;
  originalPath:     string;
  currentPath:      string;
  originalName:     string;
  fileSizeBytes?:   number | null;
  mimeType?:        string | null;
  clientId?:        number | null;
}

const NOW = () => new Date().toISOString();

function mapRow(r: Record<string, unknown>): ProcessedFile {
  return {
    id:               r['id'] as number,
    fileHash:         r['file_hash'] as string,
    originalPath:     r['original_path'] as string,
    currentPath:      r['current_path'] as string,
    originalName:     r['original_name'] as string,
    convertedPdfPath: r['converted_pdf_path'] as string | null,
    fileSizeBytes:    r['file_size_bytes'] as number | null,
    mimeType:         r['mime_type'] as string | null,
    processingStatus: r['processing_status'] as ProcessedFile['processingStatus'],
    skipReason:       r['skip_reason'] as string | null,
    ocrTextPreview:   r['ocr_text_preview'] as string | null,
    documentId:       r['document_id'] as number | null,
    clientId:         r['client_id'] as number | null,
    metadataJson:     r['metadata_json'] as string | null,
    lastScanned:      r['last_scanned'] as string,
    createdAt:        r['created_at'] as string,
    updatedAt:        r['updated_at'] as string,
  };
}

export class ProcessedFilesRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findByHash(hash: string): ProcessedFile | null {
    const row = this.db
      .prepare('SELECT * FROM ProcessedFiles WHERE file_hash = ?')
      .get(hash) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findByPath(path: string): ProcessedFile | null {
    const row = this.db
      .prepare('SELECT * FROM ProcessedFiles WHERE current_path = ?')
      .get(path) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findById(id: number): ProcessedFile | null {
    const row = this.db
      .prepare('SELECT * FROM ProcessedFiles WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  /** Insert a new entry. Returns the created record. */
  register(input: RegisterInput): ProcessedFile {
    const now = NOW();
    const result = this.db.prepare(`
      INSERT INTO ProcessedFiles
        (file_hash, original_path, current_path, original_name,
         file_size_bytes, mime_type, client_id, processing_status,
         last_scanned, created_at, updated_at)
      VALUES
        (@fileHash, @originalPath, @currentPath, @originalName,
         @fileSizeBytes, @mimeType, @clientId, 'pending',
         @now, @now, @now)
    `).run({
      fileHash:       input.fileHash,
      originalPath:   input.originalPath,
      currentPath:    input.currentPath,
      originalName:   input.originalName,
      fileSizeBytes:  input.fileSizeBytes ?? null,
      mimeType:       input.mimeType ?? null,
      clientId:       input.clientId ?? null,
      now,
    }) as { lastInsertRowid: number | bigint };

    return this.findById(Number(result.lastInsertRowid))!;
  }

  /** If hash exists but path changed, update path only — no re-processing. */
  updatePath(hash: string, newPath: string): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE ProcessedFiles
         SET current_path = ?, skip_reason = 'path_updated',
             last_scanned = ?, updated_at = ?
       WHERE file_hash = ?
    `).run(newPath, now, now, hash);
  }

  updateStatus(
    hash: string,
    status: ProcessedFile['processingStatus'],
    extras?: {
      convertedPdfPath?: string | null;
      ocrTextPreview?:   string | null;
      documentId?:       number | null;
      skipReason?:       string | null;
    },
  ): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE ProcessedFiles
         SET processing_status = @status,
             converted_pdf_path = COALESCE(@pdfPath, converted_pdf_path),
             ocr_text_preview   = COALESCE(@ocrPreview, ocr_text_preview),
             document_id        = COALESCE(@docId, document_id),
             skip_reason        = COALESCE(@skipReason, skip_reason),
             last_scanned       = @now,
             updated_at         = @now
       WHERE file_hash = @hash
    `).run({
      status,
      hash,
      now,
      pdfPath:    extras?.convertedPdfPath ?? null,
      ocrPreview: extras?.ocrTextPreview   ?? null,
      docId:      extras?.documentId       ?? null,
      skipReason: extras?.skipReason       ?? null,
    });
  }

  deleteByHash(hash: string): void {
    this.db.prepare('DELETE FROM ProcessedFiles WHERE file_hash = ?').run(hash);
  }

  reset(): number {
    return (this.db.prepare('DELETE FROM ProcessedFiles').run() as { changes: number }).changes;
  }

  markSkipped(hash: string, reason: 'already_registered' | 'path_updated'): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE ProcessedFiles
         SET processing_status = 'skipped', skip_reason = ?,
             last_scanned = ?, updated_at = ?
       WHERE file_hash = ?
    `).run(reason, now, now, hash);
  }

  list(opts: { page?: number; pageSize?: number; status?: string } = {}): {
    items: ProcessedFile[];
    total: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
  } {
    const page     = opts.page     ?? 1;
    const pageSize = opts.pageSize ?? 50;
    const offset   = (page - 1) * pageSize;

    const total = opts.status
      ? (this.db.prepare(
          'SELECT COUNT(*) as c FROM ProcessedFiles WHERE processing_status = ?',
        ).get(opts.status) as { c: number }).c
      : (this.db.prepare(
          'SELECT COUNT(*) as c FROM ProcessedFiles',
        ).get() as { c: number }).c;

    const rows = opts.status
      ? this.db.prepare(
          'SELECT * FROM ProcessedFiles WHERE processing_status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        ).all(opts.status, pageSize, offset) as Record<string, unknown>[]
      : this.db.prepare(
          'SELECT * FROM ProcessedFiles ORDER BY created_at DESC LIMIT ? OFFSET ?',
        ).all(pageSize, offset) as Record<string, unknown>[];

    return {
      items:       rows.map(mapRow),
      total,
      page,
      pageSize,
      hasNextPage: offset + pageSize < total,
    };
  }

  stats(): {
    total:     number;
    complete:  number;
    pending:   number;
    failed:    number;
    skipped:   number;
    converting: number;
    byMimeType: Record<string, number>;
  } {
    type CountRow = { processing_status: string; c: number };
    const statusRows = this.db.prepare(`
      SELECT processing_status, COUNT(*) as c FROM ProcessedFiles GROUP BY processing_status
    `).all() as CountRow[];

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) {
      byStatus[r.processing_status] = r.c;
      total += r.c;
    }

    type MimeRow = { mime_type: string | null; c: number };
    const mimeRows = this.db.prepare(`
      SELECT mime_type, COUNT(*) as c FROM ProcessedFiles
       WHERE mime_type IS NOT NULL GROUP BY mime_type
    `).all() as MimeRow[];

    const byMimeType: Record<string, number> = {};
    for (const r of mimeRows) {
      if (r.mime_type) byMimeType[r.mime_type] = r.c;
    }

    return {
      total,
      complete:   byStatus['complete']   ?? 0,
      pending:    byStatus['pending']    ?? 0,
      failed:     byStatus['failed']     ?? 0,
      skipped:    byStatus['skipped']    ?? 0,
      converting: byStatus['converting'] ?? 0,
      byMimeType,
    };
  }
}
