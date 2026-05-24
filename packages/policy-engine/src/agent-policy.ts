import type { AgentRunRequest, PolicyResult } from './types.js';

interface DbHandle {
  prepare(sql: string): { get(...args: unknown[]): unknown };
}

export function evaluateAgentRun(req: AgentRunRequest, db: DbHandle): PolicyResult {
  // Use explicit NULL-safe comparison: `IS ?` is unreliable with some driver
  // versions when the bound value is null; the explicit form is always correct.
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM AgentRunRegistry
       WHERE agent_type=?
         AND (case_id = ? OR (case_id IS NULL AND ? IS NULL))
         AND status='running'`
    )
    .get(req.agentType, req.caseId, req.caseId) as { count: number };

  if (row.count > 0) {
    return { decision: 'deny', reason: 'agent already running for this case' };
  }

  return { decision: 'allow', reason: 'no conflicting run found' };
}
