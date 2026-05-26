import { generateUUID, logger, utcNow } from '@factum-il/shared';
import type { DatabaseConnection } from '@factum-il/database';

const AGENT = 'PipelineEngine';

/**
 * Distributed lock service backed by the SQLite `Locks` table.
 * Every lock has a mandatory expiry time – no infinite locks exist.
 */
export class LockService {
  private readonly ownerId: string;

  constructor(private readonly db: DatabaseConnection) {
    this.ownerId = generateUUID();
  }

  /**
   * Attempts to acquire a lock.  Returns true on success, false if already held.
   * @param resourceKey  Unique key identifying the resource (e.g. "doc:42")
   * @param ttlMs        Lock time-to-live in milliseconds
   */
  acquire(resourceKey: string, ttlMs: number = 300_000): boolean {
    const now     = utcNow();
    const expires = new Date(Date.now() + ttlMs).toISOString();

    // Purge expired locks first
    this.db.prepare("DELETE FROM Locks WHERE expires_at < ?").run(now);

    try {
      this.db.prepare(`
        INSERT INTO Locks (resource_key, owner_id, owner_type, expires_at)
        VALUES (?, ?, 'worker', ?)
      `).run(resourceKey, this.ownerId, expires);

      logger.debug(`Lock acquired: ${resourceKey} (owner=${this.ownerId})`, {
        category: 'system', agentSource: AGENT,
      });
      return true;
    } catch {
      // UNIQUE constraint violation – lock is held by someone else
      return false;
    }
  }

  /**
   * Blocks synchronously until the lock is acquired or timeoutMs elapses.
   * Uses 100ms polling intervals.
   */
  async waitFor(resourceKey: string, ttlMs = 300_000, timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.acquire(resourceKey, ttlMs)) return true;
      await new Promise<void>((r) => setTimeout(r, 100));
    }
    logger.warn(`Lock timeout (${timeoutMs}ms) for: ${resourceKey}`, {
      category: 'system', agentSource: AGENT,
    });
    return false;
  }

  /** Releases a lock owned by this instance. */
  release(resourceKey: string): void {
    this.db.prepare(
      "DELETE FROM Locks WHERE resource_key = ? AND owner_id = ?",
    ).run(resourceKey, this.ownerId);
    logger.debug(`Lock released: ${resourceKey}`, { category: 'system', agentSource: AGENT });
  }

  /** Returns true if a non-expired lock exists for the resource key. */
  isHeld(resourceKey: string): boolean {
    const now = utcNow();
    const row = this.db.prepare(
      "SELECT id FROM Locks WHERE resource_key = ? AND expires_at > ?",
    ).get(resourceKey, now);
    return row !== undefined;
  }

  /** Purges all locks owned by this instance (e.g. on graceful shutdown). */
  releaseAll(): void {
    const { changes } = this.db.prepare("DELETE FROM Locks WHERE owner_id = ?").run(this.ownerId) as { changes: number };
    if (changes > 0) {
      logger.info(`Released ${changes} locks on shutdown`, { category: 'system', agentSource: AGENT });
    }
  }

  /** Purges globally expired locks (maintenance task). */
  purgeExpired(): number {
    const now = utcNow();
    const { changes } = this.db.prepare("DELETE FROM Locks WHERE expires_at < ?").run(now) as { changes: number };
    return changes;
  }
}
