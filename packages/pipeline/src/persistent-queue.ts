import { generateUUID, logger, utcNow } from '@factum-il/shared';
import type { ProcessingState } from '@factum-il/shared';
import type { DatabaseConnection } from '@factum-il/database';

const AGENT = 'PipelineEngine';
const BASE_BACKOFF_MS   = 5_000;
const MAX_BACKOFF_MS    = 600_000;
const DEFAULT_LOCK_TTL  = 300_000;

export interface QueueItem {
  readonly itemId:       string;
  readonly documentId:   number | null;
  readonly fileHash:     string;
  readonly originalPath: string;
  readonly currentState: ProcessingState;
  readonly retryCount:   number;
  readonly manifestRef:  string | null;
}

export interface EnqueueOptions {
  documentId?:  number;
  priority?:    number;
  maxRetries?:  number;
  manifestRef?: string;
}

/**
 * Durable processing queue backed by the SQLite ProcessingQueue table.
 * Survives crashes, reboots, and process restarts.
 * Provides at-least-once delivery with exponential backoff and poison-queue isolation.
 */
export class PersistentQueue {
  private readonly workerId: string;

  constructor(private readonly db: DatabaseConnection) {
    this.workerId = generateUUID();
  }

  /**
   * Adds a document to the queue.
   * Idempotent – if the file_hash is already queued in a non-terminal state,
   * the existing item ID is returned without creating a duplicate.
   */
  enqueue(fileHash: string, originalPath: string, opts: EnqueueOptions = {}): string {
    const existing = this.db.prepare(`
      SELECT item_id FROM ProcessingQueue
       WHERE file_hash = ? AND current_state NOT IN ('VERIFIED','ROLLED_BACK','FAILED')
       LIMIT 1
    `).get(fileHash) as { item_id: string } | undefined;

    if (existing) {
      logger.debug(`Queue: already present hash=${fileHash} item=${existing.item_id}`, {
        category: 'system', agentSource: AGENT,
      });
      return existing.item_id;
    }

    const itemId = generateUUID();
    this.db.prepare(`
      INSERT INTO ProcessingQueue
        (item_id, document_id, file_hash, original_path,
         current_state, target_state, priority, max_retries, manifest_ref)
      VALUES (?, ?, ?, ?, 'DISCOVERED', 'VERIFIED', ?, ?, ?)
    `).run(
      itemId,
      opts.documentId ?? null,
      fileHash,
      originalPath,
      opts.priority  ?? 5,
      opts.maxRetries ?? 3,
      opts.manifestRef ?? null,
    );

    logger.info(`Queue: enqueued item=${itemId} hash=${fileHash}`, {
      category: 'system', agentSource: AGENT,
    });
    return itemId;
  }

  /**
   * Atomically claims the highest-priority available item for this worker.
   * Releases expired locks from crashed workers before claiming.
   * Returns null when the queue is empty.
   */
  dequeue(): QueueItem | null {
    const now = utcNow();
    const lockExpiry = new Date(Date.now() + DEFAULT_LOCK_TTL).toISOString();

    // Release stale locks
    this.db.prepare(`
      UPDATE ProcessingQueue
         SET worker_id = NULL, locked_at = NULL, lock_expires_at = NULL
       WHERE worker_id IS NOT NULL AND lock_expires_at < ?
         AND current_state NOT IN ('VERIFIED','ROLLED_BACK')
    `).run(now);

    // Find + claim in one transaction
    let claimed: QueueItem | null = null;
    this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT item_id, document_id, file_hash, original_path, current_state, retry_count, manifest_ref
          FROM ProcessingQueue
         WHERE is_poisoned = 0
           AND worker_id IS NULL
           AND current_state NOT IN ('VERIFIED','ROLLED_BACK')
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
      `).get(now) as Record<string, unknown> | undefined;

      if (!row) return;

      const itemId = row['item_id'] as string;

      this.db.prepare(`
        UPDATE ProcessingQueue
           SET worker_id = ?, locked_at = ?, lock_expires_at = ?, processing_start = ?
         WHERE item_id = ? AND worker_id IS NULL
      `).run(this.workerId, now, lockExpiry, now, itemId);

      // Verify ownership
      const check = this.db.prepare(
        "SELECT worker_id FROM ProcessingQueue WHERE item_id = ?",
      ).get(itemId) as { worker_id: string } | undefined;

      if (check?.worker_id === this.workerId) {
        claimed = {
          itemId:       itemId,
          documentId:   (row['document_id'] as number | null),
          fileHash:     row['file_hash'] as string,
          originalPath: row['original_path'] as string,
          currentState: row['current_state'] as ProcessingState,
          retryCount:   row['retry_count'] as number,
          manifestRef:  (row['manifest_ref'] as string | null),
        };
      }
    });

    return claimed;
  }

  /** Marks an item as successfully completed. */
  complete(itemId: string, finalState: ProcessingState = 'VERIFIED'): void {
    const now = utcNow();
    this.db.prepare(`
      UPDATE ProcessingQueue
         SET current_state = ?, worker_id = NULL, locked_at = NULL,
             lock_expires_at = NULL, processing_end = ?
       WHERE item_id = ?
    `).run(finalState, now, itemId);
    logger.info(`Queue: completed item=${itemId} state=${finalState}`, {
      category: 'system', agentSource: AGENT,
    });
  }

  /**
   * Records a failure and schedules retry with exponential backoff.
   * Poisons the item if max_retries is exceeded.
   */
  fail(itemId: string, error: string): void {
    const row = this.db.prepare(
      "SELECT retry_count, max_retries FROM ProcessingQueue WHERE item_id = ?",
    ).get(itemId) as { retry_count: number; max_retries: number } | undefined;

    if (!row) return;

    const newCount = row.retry_count + 1;

    if (newCount >= row.max_retries) {
      this.db.prepare(`
        UPDATE ProcessingQueue
           SET is_poisoned = 1, poison_reason = ?, current_state = 'FAILED',
               retry_count = ?, worker_id = NULL, locked_at = NULL,
               lock_expires_at = NULL, error_message = ?
         WHERE item_id = ?
      `).run(error, newCount, error, itemId);
      logger.error(`Queue: poisoned item=${itemId} after ${newCount} retries`, {
        category: 'system', agentSource: AGENT,
      });
    } else {
      const backoffMs  = Math.min(BASE_BACKOFF_MS * Math.pow(2, row.retry_count), MAX_BACKOFF_MS);
      const nextRetry  = new Date(Date.now() + backoffMs).toISOString();
      this.db.prepare(`
        UPDATE ProcessingQueue
           SET retry_count = ?, next_retry_at = ?, current_state = 'FAILED',
               worker_id = NULL, locked_at = NULL, lock_expires_at = NULL, error_message = ?
         WHERE item_id = ?
      `).run(newCount, nextRetry, error, itemId);
      logger.warn(`Queue: item=${itemId} failed (${newCount}/${row.max_retries}), retry at ${nextRetry}`, {
        category: 'system', agentSource: AGENT,
      });
    }
  }

  /** Returns queue depth by state. */
  depth(): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT current_state, COUNT(*) as c FROM ProcessingQueue
       WHERE is_poisoned = 0 GROUP BY current_state
    `).all() as { current_state: string; c: number }[];

    const result: Record<string, number> = {};
    for (const r of rows) result[r.current_state] = r.c;
    result['POISONED'] = (this.db.prepare(
      "SELECT COUNT(*) as c FROM ProcessingQueue WHERE is_poisoned = 1",
    ).get() as { c: number }).c;
    return result;
  }

  /**
   * Recovery: releases stale locks and re-queues eligible FAILED items.
   */
  recover(): void {
    const now = utcNow();
    const { changes: locks } = this.db.prepare(`
      UPDATE ProcessingQueue
         SET worker_id = NULL, locked_at = NULL, lock_expires_at = NULL
       WHERE worker_id IS NOT NULL AND lock_expires_at < ?
    `).run(now) as { changes: number };

    const { changes: requeued } = this.db.prepare(`
      UPDATE ProcessingQueue
         SET current_state = 'DISCOVERED', next_retry_at = NULL
       WHERE current_state = 'FAILED'
         AND is_poisoned = 0
         AND retry_count < max_retries
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
    `).run(now) as { changes: number };

    logger.info(`Queue recovery: ${locks} stale locks released, ${requeued} items re-queued`, {
      category: 'system', agentSource: AGENT,
    });
  }
}
