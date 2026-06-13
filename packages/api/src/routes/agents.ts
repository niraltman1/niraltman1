import { Router, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { summarizeCase } from '../modules/agents/case-summarizer.js';
import { buildTimeline } from '../modules/agents/timeline-builder.js';
import { researchLegalQuestion } from '../modules/agents/research-agent.js';
import { reviewContract } from '../modules/agents/contract-review.js';
import { runDiscovery } from '../modules/agents/discovery-agent.js';
import { runInsolvencyAnalysis } from '../modules/agents/insolvency-agent.js';
import { runDeadlineAnalysis } from '../modules/agents/deadline-analysis-agent.js';
import { runHearingPrep } from '../modules/agents/hearing-prep-agent.js';
import { runCaseIntake } from '../modules/agents/case-intake-agent.js';
import { withCaseExecutionGuard } from '../middleware/case-execution-guard.js';
import { checkExecutionValidity, markAgentCompleted, markAgentFailed, journalEvent } from '@factum-il/agent-core';
import type { CaseExecutionContext } from '@factum-il/agent-core';
import type { Repos } from '../db.js';
import { extensionPoints } from '@factum-il/sdk';

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
const caseIdSchema = z.object({
  caseId: z.number(),
}).strict();

const researchSchema = z.object({
  question: z.string().min(1),
  caseId:   z.number().optional(),
}).strict();

const contractReviewSchema = z.object({
  documentId: z.number(),
}).strict();

const hearingPrepSchema = z.object({
  caseId:    z.number(),
  hearingId: z.number(),
}).strict();

const caseIntakeSchema = z.object({
  clientName:      z.string().min(1),
  idNumber:        z.string().optional(),
  caseType:        z.string().optional(),
  factsNarrative:  z.string().min(10),
  documentIds:     z.array(z.number()).optional(),
  clientId:        z.number().optional(),
}).strict();

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
    validate(caseIdSchema),
    withCaseExecutionGuard('case-summarizer', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as z.infer<typeof caseIdSchema>;

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
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
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
    validate(caseIdSchema),
    withCaseExecutionGuard('timeline-builder', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as z.infer<typeof caseIdSchema>;

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
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
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
    validate(researchSchema),
    withCaseExecutionGuard('research-agent', repos),
    asyncHandler(async (req, res) => {
      const { question, caseId } = req.body as z.infer<typeof researchSchema>;
      if (!question.trim()) {
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
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
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
    validate(contractReviewSchema),
    withCaseExecutionGuard('contract-reviewer', repos),
    asyncHandler(async (req, res) => {
      const { documentId } = req.body as z.infer<typeof contractReviewSchema>;

      const docRow = repos.db.prepare('SELECT id FROM Documents WHERE id = ?').get(documentId);
      if (!docRow) throw new NotFoundError(`Document ${documentId} not found`);

      const { traceId, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, null, username, { documentId });
      try {
        const output = await reviewContract(repos, documentId);
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, null, username);
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
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
    validate(caseIdSchema),
    withCaseExecutionGuard('discovery-agent', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as z.infer<typeof caseIdSchema>;

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
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // GET /api/agents/results?caseId=N[&limit=N]
  router.get('/results', asyncHandler((req, res) => {
    const caseId = Number(req.query['caseId']);
    const limit  = Math.min(Number(req.query['limit'] ?? 20), 50);
    if (!Number.isInteger(caseId) || caseId <= 0) throw new ValidationError('caseId required');

    const rows = repos.db.prepare(`
      SELECT id, agent_name, trace_id, case_id, document_id, result_text,
             confidence, flag_review, tool_log, duration_ms, created_at
        FROM AgentResults
       WHERE case_id = ?
       ORDER BY created_at DESC
       LIMIT ?
    `).all(caseId, limit) as Record<string, unknown>[];

    ok(res, { results: rows });
  }));

  // POST /api/agents/insolvency-summary  { caseId: number }
  router.post('/insolvency-summary',
    validate(caseIdSchema),
    withCaseExecutionGuard('insolvency-agent', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as z.infer<typeof caseIdSchema>;
      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);
      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await runInsolvencyAnalysis(repos, caseId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/deadline-analysis  { caseId: number }
  router.post('/deadline-analysis',
    validate(caseIdSchema),
    withCaseExecutionGuard('deadline-analysis', repos),
    asyncHandler(async (req, res) => {
      const { caseId } = req.body as z.infer<typeof caseIdSchema>;
      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);
      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await runDeadlineAnalysis(repos, caseId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/hearing-prep  { caseId: number, hearingId: number }
  router.post('/hearing-prep',
    validate(hearingPrepSchema),
    withCaseExecutionGuard('hearing-prep', repos),
    asyncHandler(async (req, res) => {
      const { caseId, hearingId } = req.body as z.infer<typeof hearingPrepSchema>;
      const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
      if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);
      const { traceId, caseStateHash, username } = guardMeta(req);
      journalEvent(repos.db, 'execution_started', traceId, caseId, username);
      try {
        const output = await runHearingPrep(repos, caseId, hearingId);
        const stale = staleMeta(caseId, caseStateHash, username, repos.db);
        if (stale.isStale) journalEvent(repos.db, 'stale_detected', traceId, caseId, username, { reason: stale.staleReason });
        markAgentCompleted(traceId, repos.db);
        journalEvent(repos.db, 'execution_completed', traceId, caseId, username);
        extensionPoints.fireAgentCompleted(traceId).catch(() => {});
        ok(res, { ...output, ...stale });
      } catch (err) {
        markAgentFailed(traceId, String(err), repos.db);
        journalEvent(repos.db, 'execution_failed', traceId, caseId, username, { error: String(err) });
        throw err;
      }
    }),
  );

  // POST /api/agents/case-intake  { clientName, factsNarrative, ... }
  router.post('/case-intake',
    validate(caseIntakeSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof caseIntakeSchema>;
      const output = await runCaseIntake(repos, {
        clientName:     body.clientName,
        factsNarrative: body.factsNarrative,
        ...(body.idNumber    != null ? { idNumber:    body.idNumber    } : {}),
        ...(body.caseType    != null ? { caseType:    body.caseType    } : {}),
        ...(body.documentIds != null ? { documentIds: body.documentIds } : {}),
        ...(body.clientId    != null ? { clientId:    body.clientId    } : {}),
      });
      ok(res, output);
    }),
  );

  // GET /api/agents/runs?limit=N — recent runs across all cases (workspace overview)
  router.get('/runs', asyncHandler((req, res) => {
    const limit = Math.min(Number(req.query['limit'] ?? 10), 50);
    const rows = repos.db.prepare(`
      SELECT id, agent_name, case_id, confidence, flag_review, created_at
        FROM AgentResults
       ORDER BY created_at DESC
       LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    ok(res, { runs: rows });
  }));

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
