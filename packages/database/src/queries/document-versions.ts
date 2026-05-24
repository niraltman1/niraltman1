import type { DatabaseConnection } from '../connection.js';

export interface DocumentVersion {
  id:          number;
  documentId:  number;
  version:     number;
  fileHash:    string;
  storagePath: string;
  filename:    string;
  createdBy:   string | null;
  changeNote:  string | null;
  createdAt:   string;
}

export interface DocumentVersionCreateInput {
  documentId:  number;
  version:     number;
  fileHash:    string;
  storagePath: string;
  filename:    string;
  createdBy?:  string;
  changeNote?: string;
}

export class DocumentVersionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(input: DocumentVersionCreateInput): DocumentVersion {
    this.db.prepare(`
      INSERT INTO DocumentVersions
        (document_id, version, file_hash, storage_path, filename, created_by, change_note)
      VALUES
        (@documentId, @version, @fileHash, @storagePath, @filename, @createdBy, @changeNote)
    `).run({
      documentId:  input.documentId,
      version:     input.version,
      fileHash:    input.fileHash,
      storagePath: input.storagePath,
      filename:    input.filename,
      createdBy:   input.createdBy  ?? null,
      changeNote:  input.changeNote ?? null,
    });
    return this.findByDocumentAndVersion(input.documentId, input.version)!;
  }

  findById(id: number): DocumentVersion | null {
    const row = this.db.prepare(
      `SELECT * FROM DocumentVersions WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByDocument(documentId: number): DocumentVersion[] {
    return (this.db.prepare(
      `SELECT * FROM DocumentVersions WHERE document_id = ? ORDER BY version ASC`,
    ).all(documentId) as Record<string, unknown>[]).map((r) => this.mapRow(r));
  }

  findByDocumentAndVersion(documentId: number, version: number): DocumentVersion | null {
    const row = this.db.prepare(
      `SELECT * FROM DocumentVersions WHERE document_id = ? AND version = ?`,
    ).get(documentId, version) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getLatestVersion(documentId: number): DocumentVersion | null {
    const row = this.db.prepare(
      `SELECT * FROM DocumentVersions WHERE document_id = ? ORDER BY version DESC LIMIT 1`,
    ).get(documentId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM DocumentVersions WHERE id = ?`).run(id);
  }

  private mapRow(row: Record<string, unknown>): DocumentVersion {
    return {
      id:          Number(row['id']),
      documentId:  Number(row['document_id']),
      version:     Number(row['version']),
      fileHash:    String(row['file_hash'] ?? ''),
      storagePath: String(row['storage_path'] ?? ''),
      filename:    String(row['filename'] ?? ''),
      createdBy:   row['created_by']  != null ? String(row['created_by'])  : null,
      changeNote:  row['change_note'] != null ? String(row['change_note']) : null,
      createdAt:   String(row['created_at'] ?? ''),
    };
  }
}
