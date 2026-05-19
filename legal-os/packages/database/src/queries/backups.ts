import type { DatabaseConnection } from '../connection.js';
import { generateUUID } from '@legal-os/shared';

export interface BackupSnapshot {
  snapshotId:     string;
  backupPath:     string;
  sizeBytes:      number;
  documentCount:  number;
  dbIntegrity:    'unchecked' | 'ok' | 'error';
  verified:       boolean;
  notes:          string | null;
  createdAt:      Date;
}

function mapRow(row: Record<string, unknown>): BackupSnapshot {
  return {
    snapshotId:    String(row['snapshot_id'] ?? ''),
    backupPath:    String(row['backup_path'] ?? ''),
    sizeBytes:     Number(row['size_bytes']  ?? 0),
    documentCount: Number(row['document_count'] ?? 0),
    dbIntegrity:   (row['db_integrity'] ?? 'unchecked') as BackupSnapshot['dbIntegrity'],
    verified:      Number(row['verified'] ?? 0) === 1,
    notes:         row['notes'] ? String(row['notes']) : null,
    createdAt:     new Date(String(row['created_at'])),
  };
}

export class BackupRepository {
  constructor(private readonly db: DatabaseConnection) {}

  record(backupPath: string, sizeBytes: number, notes?: string): string {
    const snapshotId = generateUUID();
    const count = this.db
      .prepare(`SELECT COUNT(*) as c FROM Documents WHERE processing_state != 'ROLLED_BACK'`)
      .get() as { c: number };

    this.db.prepare(`
      INSERT INTO BackupSnapshots (snapshot_id, backup_path, size_bytes, document_count, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(snapshotId, backupPath, sizeBytes, count.c, notes ?? null);

    return snapshotId;
  }

  markVerified(snapshotId: string, integrity: 'ok' | 'error'): void {
    this.db.prepare(`
      UPDATE BackupSnapshots
      SET verified = 1, db_integrity = ?
      WHERE snapshot_id = ?
    `).run(integrity, snapshotId);
  }

  list(limit = 20): BackupSnapshot[] {
    const rows = this.db.prepare(`
      SELECT * FROM BackupSnapshots
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  getLatest(): BackupSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM BackupSnapshots
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  getById(snapshotId: string): BackupSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM BackupSnapshots WHERE snapshot_id = ?
    `).get(snapshotId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  recordV2(
    backupPath:  string,
    sizeBytes:   number,
    notes?:      string,
    encryption?: { isEncrypted: boolean; encIv?: string; encTag?: string; keyDerivation?: string },
  ): string {
    const snapshotId = generateUUID();
    const count = this.db
      .prepare(`SELECT COUNT(*) as c FROM Documents WHERE processing_state != 'ROLLED_BACK'`)
      .get() as { c: number };
    this.db.prepare(`
      INSERT INTO BackupSnapshots
        (snapshot_id, backup_path, size_bytes, document_count, notes,
         is_encrypted, encryption_iv, encryption_tag, key_derivation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      snapshotId, backupPath, sizeBytes, count.c, notes ?? null,
      encryption?.isEncrypted ? 1 : 0,
      encryption?.encIv       ?? null,
      encryption?.encTag      ?? null,
      encryption?.keyDerivation ?? null,
    );
    return snapshotId;
  }

  delete(snapshotId: string): void {
    this.db.prepare(`DELETE FROM BackupSnapshots WHERE snapshot_id = ?`).run(snapshotId);
  }
}
