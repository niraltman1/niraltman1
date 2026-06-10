import { logger } from '@factum-il/shared';

interface DbHandle {
  prepare(sql: string): { run(...args: unknown[]): unknown };
}

// Prepared-statement cache keyed by db handle — avoids re-compiling the query
// on every journalEvent() call in high-throughput agent pipelines (BN6).
const stmtCache = new WeakMap<object, ReturnType<DbHandle['prepare']>>();

function getInsertStmt(db: DbHandle): ReturnType<DbHandle['prepare']> {
  let stmt = stmtCache.get(db as object);
  if (!stmt) {
    stmt = db.prepare(
      `INSERT INTO AgentExecutionEvents
         (execution_id, case_id, user_id, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmtCache.set(db as object, stmt);
  }
  return stmt;
}

export type JournalEventType =
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'stale_detected'
  | 'concurrency_blocked'
  | 'retrieval_fallback'
  | 'authorization_failed';

/**
 * Appends a structured event to AgentExecutionEvents.
 * Never throws — a journal write must not crash the main execution path.
 */
export function journalEvent(
  db:          DbHandle,
  eventType:   JournalEventType,
  executionId: string,
  caseId:      number | null,
  userId:      string | null,
  payload?:    Record<string, unknown>,
): void {
  try {
    getInsertStmt(db).run(
      executionId,
      caseId,
      userId,
      eventType,
      payload !== undefined ? JSON.stringify(payload) : null,
    );
  } catch (err) {
    // Non-fatal: table may not exist on older installs without migration 053
    logger.warn(`[execution-journal] Failed to write event ${eventType}: ${String(err)}`, {
      category: 'ai',
      agentSource: 'ExecutionJournal',
    });
  }
}
