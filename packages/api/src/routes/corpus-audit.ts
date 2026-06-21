import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';

/**
 * Quantitative audit of the legal-brain corpora (audit AI-1.3).
 *   GET /api/corpus-audit — counts of laws/verdicts, raw-text volume,
 *                           embedded-vs-FTS coverage, live vector tables,
 *                           and detected retrieval bottlenecks.
 *
 * Read-only and side-effect free; safe to call on a fresh or fully-loaded DB.
 */
export function corpusAuditRouter(repos: Repos): Router {
  const router = Router();

  router.get('/', asyncHandler((_req, res) => {
    ok(res, repos.corpusAudit.audit());
  }));

  return router;
}
