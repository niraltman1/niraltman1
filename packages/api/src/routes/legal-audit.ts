import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

/**
 * Flat quantitative audit of the legal brain (Task 1.3).
 *   GET /api/legal/audit → fixed contract:
 *     { laws, law_sections, verdicts, chunks, embedded_documents,
 *       embedded_chunks, char_count, citation_edges }
 *
 * Returns the raw contract object (not wrapped) so external tooling / the CLI
 * consume a stable shape. Read-only and side-effect free.
 */
export function legalAuditRouter(repos: Repos): Router {
  const router = Router();

  router.get('/audit', asyncHandler((_req, res) => {
    res.json(repos.corpusAudit.legalAuditContract());
  }));

  return router;
}
