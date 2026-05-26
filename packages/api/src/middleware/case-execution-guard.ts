import type { RequestHandler } from 'express';
import { canRunAgent, computeCaseStateHash, journalEvent } from '@factum-il/agent-core';
import { ConflictError } from '../errors/api-error.js';
import type { Repos } from '../db.js';

// Shape of req after the guard runs (and after requireAuth)
export interface GuardedRequest {
  traceId:       string;
  caseStateHash: string;
  guardedCaseId: number;
  username:      string;
}

/**
 * Middleware factory for agent routes.
 *
 * On every request it:
 *  1. Reads caseId from req.body (must already be validated as number by the caller)
 *  2. Calls canRunAgent() — inserts a 'running' row in AgentRunRegistry via
 *     INSERT OR IGNORE; if changes === 0 another run is already active → 409
 *  3. Computes the case state hash and attaches { traceId, caseStateHash } to req
 *     so route handlers can check staleness after the AI call completes
 *
 * Route handlers are responsible for calling markAgentCompleted / markAgentFailed.
 */
export function withCaseExecutionGuard(
  agentType: string,
  repos:     Repos,
): RequestHandler {
  return (req, _res, next) => {
    try {
      const body     = req.body as Record<string, unknown>;
      const caseId   = typeof body['caseId'] === 'number' ? body['caseId'] : null;
      const username = (req as unknown as { username?: string }).username ?? 'unknown';

      const { allowed, traceId } = canRunAgent(agentType, caseId, repos.db);

      if (!allowed) {
        journalEvent(repos.db, 'concurrency_blocked', traceId, caseId, username, { agentType });
        return next(
          new ConflictError(
            `Agent "${agentType}" is already running for this case — please wait and retry`,
          ),
        );
      }

      const caseStateHash =
        caseId !== null ? computeCaseStateHash(caseId, repos.db) : 'no-case';

      const guarded = req as unknown as Record<string, unknown>;
      guarded['traceId']       = traceId;
      guarded['caseStateHash'] = caseStateHash;
      guarded['guardedCaseId'] = caseId;
      guarded['username']      = username;

      next();
    } catch (err) {
      next(err);
    }
  };
}
