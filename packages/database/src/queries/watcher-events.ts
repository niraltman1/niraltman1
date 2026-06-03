import type { DatabaseConnection } from '../connection.js';

/**
 * File-ingestion queue (Vacuum Protocol). The FileWatcher records every stable file it
 * detects as a WatcherEvents row (processed = 0). A background processor drains the queue,
 * calls the media pipeline, and marks each row processed — durable across restarts and
 * retry-able, since the table (migration 007) survives a crash.
 */

export type WatcherEventType = 'added' | 'changed' | 'renamed' | 'removed';

export interface WatcherEventRow {
  id:            number;
  eventType:     WatcherEventType;
  filePath:      string;
  fileHash:      string | null;
  processed:     boolean;
  queued:        boolean;
  duplicate:     boolean;
  errorMessage:  string | null;
  occurredAt:    string;
  processedAt:   string | null;
}

export interface WatcherEventStats {
  unprocessed:    number;
  processed:      number;
  errors:         number;       // unprocessed rows that recorded an error (awaiting retry)
  lastProcessedAt: string | null;
}

export interface MarkProcessedInput {
  queued?:    boolean;
  duplicate?: boolean;
  error?:     string | null;   // set when the row is closed with a terminal failure
}

function mapRow(r: Record<string, unknown>): WatcherEventRow {
  return {
    id:           r['id'] as number,
    eventType:    r['event_type'] as WatcherEventType,
    filePath:     r['file_path'] as string,
    fileHash:     (r['file_hash'] as string | null) ?? null,
    processed:    Number(r['processed']) === 1,
    queued:       Number(r['queued']) === 1,
    duplicate:    Number(r['duplicate']) === 1,
    errorMessage: (r['error_message'] as string | null) ?? null,
    occurredAt:   r['occurred_at'] as string,
    processedAt:  (r['processed_at'] as string | null) ?? null,
  };
}

export class WatcherEventsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** Oldest-first batch of pending events for the processor to drain. */
  listUnprocessed(limit = 50): WatcherEventRow[] {
    return (this.db.prepare(
      'SELECT * FROM WatcherEvents WHERE processed = 0 ORDER BY occurred_at ASC, id ASC LIMIT ?',
    ).all(limit) as Record<string, unknown>[]).map(mapRow);
  }

  /** Recent events (any state) for the monitoring UI. */
  recent(limit = 100): WatcherEventRow[] {
    return (this.db.prepare(
      'SELECT * FROM WatcherEvents ORDER BY occurred_at DESC, id DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[]).map(mapRow);
  }

  get(id: number): WatcherEventRow | null {
    const r = this.db.prepare('SELECT * FROM WatcherEvents WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? mapRow(r) : null;
  }

  /** Close a row as handled (success or terminal failure). */
  markProcessed(id: number, input: MarkProcessedInput = {}): void {
    this.db.prepare(`
      UPDATE WatcherEvents
         SET processed = 1, queued = ?, duplicate = ?, error_message = ?, processed_at = datetime('now')
       WHERE id = ?
    `).run(
      input.queued    ? 1 : 0,
      input.duplicate ? 1 : 0,
      input.error ?? null,
      id,
    );
  }

  /** Record a retryable failure without closing the row (stays processed = 0). */
  recordRetryableError(id: number, message: string): void {
    this.db.prepare('UPDATE WatcherEvents SET error_message = ? WHERE id = ?').run(message.slice(0, 500), id);
  }

  /** Enqueue a file the watcher would have caught (used by a manual folder rescan). */
  enqueue(filePath: string, eventType: WatcherEventType = 'added'): WatcherEventRow {
    const res = this.db.prepare(
      'INSERT INTO WatcherEvents (event_type, file_path, debounce_key) VALUES (?, ?, ?)',
    ).run(eventType, filePath, filePath);
    return this.get(Number(res.lastInsertRowid))!;
  }

  stats(): WatcherEventStats {
    const counts = this.db.prepare(`
      SELECT
        SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) AS unprocessed,
        SUM(CASE WHEN processed = 1 THEN 1 ELSE 0 END) AS processed,
        SUM(CASE WHEN processed = 0 AND error_message IS NOT NULL THEN 1 ELSE 0 END) AS errors
      FROM WatcherEvents
    `).get() as Record<string, number | null>;
    const last = this.db.prepare(
      'SELECT processed_at FROM WatcherEvents WHERE processed = 1 ORDER BY processed_at DESC LIMIT 1',
    ).get() as { processed_at: string } | undefined;
    return {
      unprocessed:     Number(counts['unprocessed'] ?? 0),
      processed:       Number(counts['processed'] ?? 0),
      errors:          Number(counts['errors'] ?? 0),
      lastProcessedAt: last?.processed_at ?? null,
    };
  }
}
