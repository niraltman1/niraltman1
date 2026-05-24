interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number };
    get(...args: unknown[]): unknown;
  };
}

interface CountRow {
  count: number;
}

export function isEventProcessed(idempotencyKey: string, db: DbHandle): boolean {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM WorkflowIdempotencyLog WHERE idempotency_key = ?'
  ).get(idempotencyKey) as CountRow;
  return row.count > 0;
}

export function markEventProcessed(idempotencyKey: string, db: DbHandle): void {
  db.prepare(
    'INSERT OR IGNORE INTO WorkflowIdempotencyLog (idempotency_key) VALUES (?)'
  ).run(idempotencyKey);
}
