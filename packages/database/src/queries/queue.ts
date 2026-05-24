import { utcNow } from '@factum-il/shared';
import type { DatabaseConnection } from '../connection.js';

export interface QueueStats {
  readonly byState:   Record<string, number>;
  readonly poisoned:  number;
  readonly total:     number;
}

export class QueueRepository {
  constructor(private readonly db: DatabaseConnection) {}

  getStats(): QueueStats {
    const rows = this.db.prepare(`
      SELECT current_state, COUNT(*) as c
        FROM ProcessingQueue
       WHERE is_poisoned = 0
       GROUP BY current_state
    `).all() as { current_state: string; c: number }[];

    const byState: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byState[r.current_state] = r.c;
      total += r.c;
    }

    const poisoned = (this.db.prepare(
      "SELECT COUNT(*) as c FROM ProcessingQueue WHERE is_poisoned = 1",
    ).get() as { c: number }).c;

    return { byState, poisoned, total: total + poisoned };
  }

  listRecent(limit = 50): Record<string, unknown>[] {
    return this.db.prepare(`
      SELECT * FROM ProcessingQueue ORDER BY updated_at DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];
  }

  getPoisoned(limit = 50): Record<string, unknown>[] {
    return this.db.prepare(`
      SELECT * FROM ProcessingQueue WHERE is_poisoned = 1 ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];
  }

  /** Re-queues a single poisoned item for another attempt. */
  requeue(itemId: string): boolean {
    const result = this.db.prepare(`
      UPDATE ProcessingQueue
         SET is_poisoned = 0, poison_reason = NULL, current_state = 'DISCOVERED',
             retry_count = 0, next_retry_at = NULL, worker_id = NULL,
             error_message = NULL, updated_at = ?
       WHERE item_id = ? AND is_poisoned = 1
    `).run(utcNow(), itemId) as { changes: number };
    return result.changes > 0;
  }
}
