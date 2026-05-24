import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { summarizeCase } from '../modules/agents/case-summarizer.js';
import { buildTimeline } from '../modules/agents/timeline-builder.js';
import { researchLegalQuestion } from '../modules/agents/research-agent.js';
import { reviewContract } from '../modules/agents/contract-review.js';
import { runDiscovery } from '../modules/agents/discovery-agent.js';
import type { Repos } from '../db.js';

export function agentsRouter(repos: Repos): Router {
  const router = Router();
  router.use(requireAuth(repos));

  // POST /api/agents/summarize  { caseId: number }
  router.post('/summarize', asyncHandler(async (req, res) => {
    const { caseId } = req.body as { caseId?: unknown };
    if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

    const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
    if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

    const output = await summarizeCase(repos, caseId);
    ok(res, output);
  }));

  // POST /api/agents/timeline  { caseId: number }
  router.post('/timeline', asyncHandler(async (req, res) => {
    const { caseId } = req.body as { caseId?: unknown };
    if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

    const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
    if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

    const output = await buildTimeline(repos, caseId);
    ok(res, output);
  }));

  // POST /api/agents/research  { question: string; caseId?: number }
  router.post('/research', asyncHandler(async (req, res) => {
    const { question, caseId } = req.body as { question?: unknown; caseId?: unknown };
    if (typeof question !== 'string' || !question.trim()) {
      throw new ValidationError('question (string) required');
    }

    const output = await researchLegalQuestion(
      repos,
      question.trim(),
      typeof caseId === 'number' ? caseId : undefined,
    );
    ok(res, output);
  }));

  // POST /api/agents/contract-review  { documentId: number }
  router.post('/contract-review', asyncHandler(async (req, res) => {
    const { documentId } = req.body as { documentId?: unknown };
    if (typeof documentId !== 'number') throw new ValidationError('documentId (number) required');

    const docRow = repos.db.prepare('SELECT id FROM Documents WHERE id = ?').get(documentId);
    if (!docRow) throw new NotFoundError(`Document ${documentId} not found`);

    const output = await reviewContract(repos, documentId);
    ok(res, output);
  }));

  // POST /api/agents/discovery  { caseId: number }
  router.post('/discovery', asyncHandler(async (req, res) => {
    const { caseId } = req.body as { caseId?: unknown };
    if (typeof caseId !== 'number') throw new ValidationError('caseId (number) required');

    const caseRow = repos.db.prepare('SELECT id FROM Cases WHERE id = ?').get(caseId);
    if (!caseRow) throw new NotFoundError(`Case ${caseId} not found`);

    const output = await runDiscovery(repos, caseId);
    ok(res, output);
  }));

  return router;
}
