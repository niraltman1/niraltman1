import type { DomainEvent } from './types.js';

// Duck-typed interface to avoid importing from @factum-il/database
interface DbHandle {
  prepare(sql: string): {
    run(...args: (string | number | null)[]): void;
    get(...args: (string | number | null)[]): unknown;
    all(...args: (string | number | null)[]): unknown[];
  };
  transaction<T>(fn: () => T): T;
}

export class EventStore {
  constructor(private readonly db: DbHandle) {}

  append(event: DomainEvent): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO EventStore (trace_id, kind, payload, occurred_at)
       VALUES (?, ?, ?, ?)`
    ).run(event.traceId, event.kind, JSON.stringify(event), event.occurredAt);
  }

  markHandled(traceId: string, handlerId: string): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO EventHandlerLog (trace_id, handler_id)
       VALUES (?, ?)`
    ).run(traceId, handlerId);
  }

  wasHandled(traceId: string, handlerId: string): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM EventHandlerLog WHERE trace_id = ? AND handler_id = ?`
    ).get(traceId, handlerId);
    return row !== undefined;
  }

  moveToDead(traceId: string, kind: string, payload: string, reason: string): void {
    this.db.prepare(
      `INSERT INTO DeadLetterQueue (trace_id, kind, payload, failure_reason)
       VALUES (?, ?, ?, ?)`
    ).run(traceId, kind, payload, reason);
  }

  queryByKind(kind: string, since?: string): DomainEvent[] {
    const rows = since !== undefined
      ? this.db.prepare(
          `SELECT payload FROM EventStore
           WHERE kind = ? AND occurred_at > ?
           ORDER BY id ASC`
        ).all(kind, since)
      : this.db.prepare(
          `SELECT payload FROM EventStore
           WHERE kind = ?
           ORDER BY id ASC`
        ).all(kind);

    return rows.map((row) => JSON.parse((row as { payload: string }).payload) as DomainEvent);
  }

  queryRecent(limitMs: number): DomainEvent[] {
    const since = new Date(Date.now() - limitMs).toISOString();
    const rows = this.db.prepare(
      `SELECT payload FROM EventStore
       WHERE occurred_at > ?
       ORDER BY id ASC`
    ).all(since);

    return rows.map((row) => JSON.parse((row as { payload: string }).payload) as DomainEvent);
  }
}
