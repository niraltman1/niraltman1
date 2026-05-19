import { generateUUID, utcNow, logger } from '@legal-os/shared';
import type { DatabaseConnection } from '@legal-os/database';

export interface SnapshotResult {
  readonly snapshotId: string;
  readonly documentId: number;
  readonly createdAt: string;
}

/**
 * TypeScript counterpart to the PowerShell ManifestSnapshot module.
 * Used by the Node.js pipeline to capture document state before mutations.
 */
export class ManifestService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Creates a manifest snapshot of the current document row.
   * Must be called BEFORE any file or metadata mutation.
   */
  createSnapshot(documentId: number, triggerEvent: string): SnapshotResult {
    const row = this.db
      .prepare('SELECT * FROM Documents WHERE id = ?')
      .get(documentId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Document id=${documentId} not found.`);
    }

    const snapshotId   = generateUUID();
    const snapshotData = JSON.stringify(row);
    const createdAt    = utcNow();

    this.db.prepare(`
      INSERT INTO ManifestSnapshots
        (snapshot_id, document_id, snapshot_data, file_hash,
         original_path, storage_path, original_size, trigger_event)
      VALUES
        (@snapshotId, @documentId, @snapshotData, @fileHash,
         @originalPath, @storagePath, @originalSize, @triggerEvent)
    `).run({
      snapshotId,
      documentId,
      snapshotData,
      fileHash:      row['file_hash'],
      originalPath:  row['original_path'],
      storagePath:   row['storage_path'],
      originalSize:  row['file_size_bytes'],
      triggerEvent,
    });

    logger.info(`Manifest snapshot created: ${snapshotId}`, {
      category: 'system',
      agentSource: 'PipelineEngine',
    });

    return { snapshotId, documentId, createdAt };
  }

  /**
   * Retrieves a snapshot by ID.  Returns null if not found.
   */
  getSnapshot(snapshotId: string): Record<string, unknown> | null {
    return (this.db
      .prepare('SELECT * FROM ManifestSnapshots WHERE snapshot_id = ?')
      .get(snapshotId) as Record<string, unknown> | undefined) ?? null;
  }
}
