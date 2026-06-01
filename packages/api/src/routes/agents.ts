import { Router, type Response } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { summarizeCase } from '../modules/agents/case-summarizer.js';
import { buildTimeline } from '../modules/agents/timeline-builder.js';
import { researchLegalQuestion } from '../modules/agents/research-agent.js';
import { reviewContract } from '../modules/agents/contract-review.js';
import { runDiscovery } from '../modules/agents/discovery-agent.js';
import { withCaseExecutionGuard } from '../middleware/case-execution-guard.js';
import { checkExecutionValidity, markAgentCompleted, markAgentFailed, journalEvent } from '@factum-il/agent-core';
import type { CaseExecutionContext } from '@factum-il/agent-core';
import type { Repos } from '../db.js';

// Helper: read guard metadata attached by withCaseExecutionGuard
function guardMeta(req: object): { traceId: string; caseStateHash: string; username: string } {
  const r = req as Record<string, unknown>;
  return {
    traceId:       r['traceId'] as string,
    caseStateHash: r['caseStateHash'] as string,
    username:      (r['username'] as string | undefined) ?? 'unknown',
  };
}

// Check if the case state is still valid and build the isStale metadata.
// Returns { isStale, staleReason } — never throws.
function staleMeta(
  caseId:        number,
  caseStateHash: string,
  username:      string,
  db:            Repos['db'],
): { isStale: boolean; staleReason: string | null } {
  const ctx: CaseExecutionContext = {
    caseId,
    userId:        username,
    requestedAt:   new Date().toISOString(),
    caseStateHash,
  };
  const validity = checkExecutionValidity(ctx, db);
  return {
    isStale:    !validity.valid,
    staleReason: validity.reason ?? null,
  };
}

export function agentsRouter(repos: Repos): Router {
  const router = Router();
  router.use(requireAuth(repos));

  // POST /api/agents/summarize  { caseId: number }
  router.post('/summarize',
    withCaseExecutionGuard('case-summarizer', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as { caseId?: unknown };
      if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await summarizeCase(repos, caseId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/timeline  { caseId: number }
  router.post('/timeline',
    withCaseExecutionGuard('timeline-builder', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as { caseId?: unknown };
      if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await buildTimeline(repos, caseId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/research  { question: string; caseId?: number }
  router.post('/research',
    withCaseExecutionGuard('research-agent', repos),
    asyncHandler(async (req, res) => {
      const { question, caseId } = req.body as { question?: unknown; caseId?: unknown };
      if (typeof question !== 'string' || !question.trim()) {
        throw new ValidationError('question (string) required');
      }

      const { traceId, caseStateHash, username } = guardMeta(req);
      const resolvedCaseId = typeof caseId === 'number' ? caseId : null;
      journalEvent(repos.db, 'execution_started', traceId, resolvedCaseId, username);
      try {
        const output = await researchLegalQuestion(
          repos,
          question.trim(),
          resolvedCaseId ?? undefined,
        );
        const stale = resolvedCaseId !== null
          ? staleMeta(resolvedCaseId, caseStateHash, username, repos.db)
          : { isStale: false, staleReason: null };
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, resolvedCaseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, resolvedCaseId, username);
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, resolvedCaseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/contract-review  { documentId: number }
  router.post('/contract-review',
    withCaseExecutionGuard('contract-reviewer', repos),
    asyncHandler(async (req, res) => {
      const { documentId } = req.body as { documentId?: unknown };
      if (typeof documentId !== 'number') throw new ValidationError('documentId (number) required');

      const docRow = repos.db.prepare('SELECT id FROM Documents WHERE id = ?').get(documentId);
      if (!docRow) throw new NotFoundError(`Document ${documentId} not found`);

      const { traceId, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, null, username, { documentId });
      try {
        const output = await reviewContract(repos, documentId);
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, null, username);
        // Contract review is document-scoped; no case staleness check needed
        ok(res, { ...output, isStale: false, staleReason: null });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, null, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/discovery  { caseId: number }
  router.post('/discovery',
    withCaseExecutionGuard('discovery-agent', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as { caseId?: unknown };
      if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await runDiscovery(repos, caseId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  return router;
}

// ── Streaming SSE variants ────────────────────────────────────────────────
// These GET endpoints mirror the POST routes above but stream progress via SSE.
// Clients connect via EventSource and receive: progress → result (or error).
// Event format: event: <type>\ndata: <JSON>\n\n

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function sseSend(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function agentsStreamRouter(repos: Repos): Router {
  const router = Router();

  // GET /api/agents/summarize/stream?caseId=N
  router.get('/summarize/stream', asyncHandler(async (req, res) => {
    const caseId = parseInt(req.query['caseId'] as string, 10);
    if (isNaN(caseId)) { res.status(400).json({ error: 'caseId required' }); return; }

    sseHeaders(res);
    sseSend(res, 'progress', { stage: 'validating', pct: 5, message: 'מאמת נתוני תיק…' });

    try {
      const output = await summarizeCase(repos, caseId, (p) => sseSend(res, 'progress', p));
      sseSend(res, 'progress', { stage: 'done', pct: 100, message: 'הושלם' });
      sseSend(res, 'result', { ...output, isStale: false });
    } catch (err) {
      sseSend(res, 'error', { message: String(err) });
    }
    res.end();
  }));

  // GET /api/agents/timeline/stream?caseId=N
  router.get('/timeline/stream', asyncHandler(async (req, res) => {
    const caseId = parseInt(req.query['caseId'] as string, 10);
    if (isNaN(caseId)) { res.status(400).json({ error: 'caseId required' }); return; }

    sseHeaders(res);
    sseSend(res, 'progress', { stage: 'validating', pct: 5, message: 'מאמת נתוני תיק…' });

    try {
      const output = await buildTimeline(repos, caseId, (p) => sseSend(res, 'progress', p));
      sseSend(res, 'progress', { stage: 'done', pct: 100, message: 'הושלם' });
      sseSend(res, 'result', { ...output, isStale: false });
    } catch (err) {
      sseSend(res, 'error', { message: String(err) });
    }
    res.end();
  }));

  // GET /api/agents/research/stream?question=...&caseId=N
  router.get('/research/stream', asyncHandler(async (req, res) => {
    const question = req.query['question'];
    if (typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'question required' }); return;
    }
    const caseIdRaw = req.query['caseId'];
    const caseId = caseIdRaw !== undefined ? parseInt(caseIdRaw as string, 10) : NaN;
    const resolvedCaseId = !isNaN(caseId) ? caseId : undefined;

    sseHeaders(res);
    sseSend(res, 'progress', { stage: 'validating', pct: 5, message: 'מאמת שאלה משפטית…' });

    try {
      const output = await researchLegalQuestion(repos, question.trim(), resolvedCaseId, (p) => sseSend(res, 'progress', p));
      sseSend(res, 'progress', { stage: 'done', pct: 100, message: 'הושלם' });
      sseSend(res, 'result', { ...output, isStale: false });
    } catch (err) {
      sseSend(res, 'error', { message: String(err) });
    }
    res.end();
  }));

  // GET /api/agents/contract-review/stream?documentId=N
  router.get('/contract-review/stream', asyncHandler(async (req, res) => {
    const documentId = parseInt(req.query['documentId'] as string, 10);
    if (isNaN(documentId)) { res.status(400).json({ error: 'documentId required' }); return; }

    sseHeaders(res);
    sseSend(res, 'progress', { stage: 'validating', pct: 5, message: 'מאמת מסמך…' });

    try {
      const output = await reviewContract(repos, documentId, (p) => sseSend(res, 'progress', p));
      sseSend(res, 'progress', { stage: 'done', pct: 100, message: 'הושלם' });
      sseSend(res, 'result', { ...output, isStale: false, staleReason: null });
    } catch (err) {
      sseSend(res, 'error', { message: String(err) });
    }
    res.end();
  }));

  // GET /api/agents/discovery/stream?caseId=N
  router.get('/discovery/stream', asyncHandler(async (req, res) => {
    const caseId = parseInt(req.query['caseId'] as string, 10);
    if (isNaN(caseId)) { res.status(400).json({ error: 'caseId required' }); return; }

    sseHeaders(res);
    sseSend(res, 'progress', { stage: 'validating', pct: 5, message: 'מאמת נתוני תיק…' });

    try {
      const output = await runDiscovery(repos, caseId, (p) => sseSend(res, 'progress', p));
      sseSend(res, 'progress', { stage: 'done', pct: 100, message: 'הושלם' });
      sseSend(res, 'result', { ...output, isStale: false });
    } catch (err) {
      sseSend(res, 'error', { message: String(err) });
    }
    res.end();
  }));

  return router;
}
