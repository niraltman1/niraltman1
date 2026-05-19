import { generateUUID, logger, utcNow } from '@legal-os/shared';
import type { DatabaseConnection } from '@legal-os/database';
import { HashService } from './hash.js';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const AGENT = 'PipelineEngine';

export type TransactionPhase = 'BEGIN' | 'COMMIT' | 'ROLLBACK' | 'INTERRUPTED';

export interface TransactionOptions {
  documentId:    number | null;
  operationType: string;
  pathBefore:    string;
  pathAfter:     string;
  fileHashBefore?: string;
}

/**
 * Manifest Transaction Engine.
 * Wraps every file mutation in a journal entry so it can be
 * recovered, replayed, or rolled back after a crash.
 *
 * Usage:
 *   const tx = engine.begin({ ... });
 *   // ... perform file operation ...
 *   engine.commit(tx.transactionId, fileHashAfter);
 *   // OR on failure:
 *   engine.rollback(tx.transactionId);
 */
export class ManifestTransactionEngine {
  private readonly hasher = new HashService();

  constructor(private readonly db: DatabaseConnection) {}

  /** Opens a transaction and writes a BEGIN journal entry. */
  begin(opts: TransactionOptions): { transactionId: string } {
    const transactionId = generateUUID();
    const docSnapshot   = opts.documentId
      ? JSON.stringify(this.db.prepare('SELECT * FROM Documents WHERE id = ?').get(opts.documentId))
      : '{}';

    this.db.prepare(`
      INSERT INTO TransactionJournal
        (transaction_id, document_id, phase, operation_type, agent,
         state_before, file_hash_before, path_before, path_after)
      VALUES (?, ?, 'BEGIN', ?, ?, ?, ?, ?, ?)
    `).run(
      transactionId,
      opts.documentId ?? null,
      opts.operationType,
      AGENT,
      docSnapshot,
      opts.fileHashBefore ?? null,
      opts.pathBefore,
      opts.pathAfter,
    );

    logger.debug(`TxJournal BEGIN: ${transactionId} op=${opts.operationType}`, {
      category: 'system', agentSource: AGENT,
    });
    return { transactionId };
  }

  /** Marks a transaction as committed. */
  commit(transactionId: string, fileHashAfter: string): void {
    const now        = utcNow();
    const docAfter   = this.getDocumentSnapshotForTx(transactionId);

    this.db.prepare(`
      UPDATE TransactionJournal
         SET phase = 'COMMIT', state_after = ?, file_hash_after = ?,
             committed_at = ?, interrupted = 0
       WHERE transaction_id = ?
    `).run(docAfter, fileHashAfter, now, transactionId);

    logger.debug(`TxJournal COMMIT: ${transactionId}`, {
      category: 'system', agentSource: AGENT,
    });
  }

  /**
   * Rolls back a transaction: moves the file back to path_before and
   * writes a ROLLBACK journal entry.
   */
  async rollback(transactionId: string): Promise<void> {
    const row = this.db.prepare(
      "SELECT * FROM TransactionJournal WHERE transaction_id = ?",
    ).get(transactionId) as Record<string, unknown> | undefined;

    if (!row) throw new Error(`Transaction ${transactionId} not found.`);
    if (row['phase'] === 'ROLLBACK') {
      logger.warn(`TxJournal: ${transactionId} already rolled back, skipping`, {
        category: 'rollback', agentSource: AGENT,
      });
      return;
    }

    const pathAfter  = row['path_after']  as string;
    const pathBefore = row['path_before'] as string;
    const hashBefore = row['file_hash_before'] as string | null;

    if (existsSync(pathAfter)) {
      if (hashBefore) {
        const currentHash = await this.hasher.hashFile(pathAfter);
        if (currentHash === hashBefore) {
          // File hasn't changed from original – it's already at destination, restore
        }
      }
      const destDir = dirname(pathBefore);
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      copyFileSync(pathAfter, pathBefore);
    }

    this.db.prepare(`
      UPDATE TransactionJournal
         SET phase = 'ROLLBACK', committed_at = ?, interrupted = 0
       WHERE transaction_id = ?
    `).run(utcNow(), transactionId);

    logger.warn(`TxJournal ROLLBACK: ${transactionId}`, {
      category: 'rollback', agentSource: AGENT,
    });
  }

  /**
   * Marks a transaction as interrupted (called on crash detection).
   * The CrashRecovery module will replay these on next startup.
   */
  markInterrupted(transactionId: string): void {
    this.db.prepare(
      "UPDATE TransactionJournal SET interrupted = 1 WHERE transaction_id = ? AND phase = 'BEGIN'",
    ).run(transactionId);
  }

  /** Returns all interrupted, un-replayed transactions for crash recovery. */
  getInterrupted(): Record<string, unknown>[] {
    return this.db.prepare(
      "SELECT * FROM TransactionJournal WHERE interrupted = 1 AND replayed = 0 ORDER BY created_at ASC",
    ).all() as Record<string, unknown>[];
  }

  /** Replays an interrupted transaction by re-applying or rolling it back. */
  async replay(transactionId: string): Promise<void> {
    await this.rollback(transactionId);
    this.db.prepare(
      "UPDATE TransactionJournal SET replayed = 1 WHERE transaction_id = ?",
    ).run(transactionId);
    logger.info(`TxJournal replayed: ${transactionId}`, {
      category: 'rollback', agentSource: AGENT,
    });
  }

  private getDocumentSnapshotForTx(transactionId: string): string {
    const row = this.db.prepare(
      "SELECT document_id FROM TransactionJournal WHERE transaction_id = ?",
    ).get(transactionId) as { document_id: number | null } | undefined;

    if (!row?.document_id) return '{}';
    const doc = this.db.prepare('SELECT * FROM Documents WHERE id = ?').get(row.document_id);
    return JSON.stringify(doc ?? {});
  }
}
