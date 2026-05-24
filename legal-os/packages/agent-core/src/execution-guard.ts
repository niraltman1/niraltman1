interface DbHandle {
  prepare(sql: string): { run(...args: unknown[]): { changes: number }; get(...args: unknown[]): unknown };
}

export function canRunAgent(
  agentType: string,
  caseId: number | null,
  db: DbHandle,
): { allowed: boolean; traceId: string } {
  const traceId = `${agentType}-${caseId ?? 'null'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // INSERT OR IGNORE INTO AgentRunRegistry (agent_type, case_id, status, trace_id)
  // VALUES (?, ?, 'running', ?)
  // UNIQUE(agent_type, case_id, status='running') prevents duplicates
  // If changes === 0: another run is active → return false
  const result = db.prepare(
    `INSERT OR IGNORE INTO AgentRunRegistry (agent_type, case_id, status, trace_id)
     VALUES (?, ?, 'running', ?)`,
  ).run(agentType, caseId, traceId);

  return { allowed: result.changes > 0, traceId };
}

export function markAgentCompleted(traceId: string, db: DbHandle): void {
  db.prepare(
    `UPDATE AgentRunRegistry SET status='completed', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE trace_id=?`,
  ).run(traceId);
}

export function markAgentFailed(traceId: string, _error: string, db: DbHandle): void {
  db.prepare(
    `UPDATE AgentRunRegistry SET status='failed', finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE trace_id=?`,
  ).run(traceId);
}
