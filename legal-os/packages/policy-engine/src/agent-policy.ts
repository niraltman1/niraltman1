import type { AgentRunRequest, PolicyResult } from './types.js';

interface DbHandle {
  prepare(sql: string): { get(...args: unknown[]): unknown };
}

export function evaluateAgentRun(req: AgentRunRequest, db: DbHandle): PolicyResult {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM AgentRunRegistry
       WHERE agent_type=? AND case_id IS ? AND status='running'`
    )
    .get(req.agentType, req.caseId) as { count: number };

  if (row.count > 0) {
    return { decision: 'deny', reason: 'agent already running for this case' };
  }

  return { decision: 'allow', reason: 'no conflicting run found' };
}
