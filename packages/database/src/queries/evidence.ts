import type { DatabaseConnection } from '../connection.js';

export interface EvidenceItem {
  id:               number;
  documentId:       number | null;
  caseId:           number | null;
  clientId:         number | null;
  originalPath:     string;
  lockerPath:       string;
  fileHash:         string;
  originalFilename: string;
  mimeType:         string | null;
  sourceApp:        'whatsapp' | 'email' | 'manual';
  mediaType:        'voice_note' | 'image' | 'message' | 'attachment' | 'file';
  ocrText:          string | null;
  isWriteProtected: boolean;
  notes:            string | null;
  lockedAt:         string;
  createdAt:        string;
}

export interface CreateEvidenceInput {
  originalPath:     string;
  lockerPath:       string;
  fileHash:         string;
  originalFilename: string;
  mimeType?:        string | null;
  sourceApp?:       EvidenceItem['sourceApp'];
  mediaType?:       EvidenceItem['mediaType'];
  caseId?:          number | null;
  clientId?:        number | null;
  documentId?:      number | null;
  isWriteProtected?: boolean;
  notes?:           string | null;
}

function mapRow(r: Record<string, unknown>): EvidenceItem {
  return {
    id:               Number(r['id']),
    documentId:       r['document_id'] != null ? Number(r['document_id']) : null,
    caseId:           r['case_id']     != null ? Number(r['case_id'])     : null,
    clientId:         r['client_id']   != null ? Number(r['client_id'])   : null,
    originalPath:     String(r['original_path'] ?? ''),
    lockerPath:       String(r['locker_path']   ?? ''),
    fileHash:         String(r['file_hash']     ?? ''),
    originalFilename: String(r['original_filename'] ?? ''),
    mimeType:         r['mime_type']  != null ? String(r['mime_type'])  : null,
    sourceApp:        (r['source_app'] ?? 'whatsapp') as EvidenceItem['sourceApp'],
    mediaType:        (r['media_type'] ?? 'file')     as EvidenceItem['mediaType'],
    ocrText:          r['ocr_text']   != null ? String(r['ocr_text'])   : null,
    isWriteProtected: Number(r['is_write_protected'] ?? 0) === 1,
    notes:            r['notes']      != null ? String(r['notes'])      : null,
    lockedAt:         String(r['locked_at']  ?? ''),
    createdAt:        String(r['created_at'] ?? ''),
  };
}

export class EvidenceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findById(id: number): EvidenceItem | null {
    const row = this.db.prepare(
      `SELECT * FROM EvidenceItems WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findByHash(hash: string): EvidenceItem | null {
    const row = this.db.prepare(
      `SELECT * FROM EvidenceItems WHERE file_hash = ?`,
    ).get(hash) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findByCase(caseId: number): EvidenceItem[] {
    return (this.db.prepare(
      `SELECT * FROM EvidenceItems WHERE case_id = ? ORDER BY locked_at DESC`,
    ).all(caseId) as Record<string, unknown>[]).map(mapRow);
  }

  findByClient(clientId: number): EvidenceItem[] {
    return (this.db.prepare(
      `SELECT * FROM EvidenceItems WHERE client_id = ? ORDER BY locked_at DESC`,
    ).all(clientId) as Record<string, unknown>[]).map(mapRow);
  }

  list(filters: { caseId?: number; clientId?: number; mediaType?: string; limit?: number } = {}): EvidenceItem[] {
    const conds: string[] = [];
    const args:  unknown[] = [];
    if (filters.caseId    != null) { conds.push('case_id = ?');    args.push(filters.caseId); }
    if (filters.clientId  != null) { conds.push('client_id = ?');  args.push(filters.clientId); }
    if (filters.mediaType != null) { conds.push('media_type = ?'); args.push(filters.mediaType); }
    const cap = Math.min(filters.limit ?? 200, 500);
    args.push(cap);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return (this.db.prepare(
      `SELECT * FROM EvidenceItems ${where} ORDER BY locked_at DESC LIMIT ?`,
    ).all(...args) as Record<string, unknown>[]).map(mapRow);
  }

  create(input: CreateEvidenceInput): EvidenceItem {
    const result = this.db.prepare(`
      INSERT INTO EvidenceItems
        (original_path, locker_path, file_hash, original_filename, mime_type,
         source_app, media_type, case_id, client_id, document_id, is_write_protected, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.originalPath,
      input.lockerPath,
      input.fileHash,
      input.originalFilename,
      input.mimeType  ?? null,
      input.sourceApp ?? 'whatsapp',
      input.mediaType ?? 'file',
      input.caseId    ?? null,
      input.clientId  ?? null,
      input.documentId ?? null,
      input.isWriteProtected ? 1 : 0,
      input.notes ?? null,
    );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  setAnalysis(id: number, ocrText: string): void {
    this.db.prepare(
      `UPDATE EvidenceItems SET ocr_text = ? WHERE id = ?`,
    ).run(ocrText, id);
  }

  search(query: string, limit = 20): EvidenceItem[] {
    const rows = this.db.prepare(`
      SELECT e.* FROM fts_evidence f
      JOIN EvidenceItems e ON e.id = f.rowid
      WHERE fts_evidence MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }
}
