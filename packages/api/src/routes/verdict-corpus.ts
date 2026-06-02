import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

/**
 * Read surface over the verbatim verdict corpus (migration 063) — bulk Israeli court
 * rulings ingested from public open datasets. Distinct from /api/case-law, which is the
 * curated precedent registry. Every result carries its provenance + snapshot label so
 * callers know it is a point-in-time copy, not the live court record.
 *   GET /api/verdict-corpus/verdicts?court=&limit=  — recent rulings + KB stats
 *   GET /api/verdict-corpus/verdicts/:docKey         — one ruling (full verbatim text)
 *   GET /api/verdict-corpus/search?q=&court=         — keyword search (snippets)
 */
export function verdictCorpusRouter(repos: Repos): Router {
  const router = Router();
  const { verdictCorpus } = repos;

  router.get('/verdicts', asyncHandler((req, res) => {
    const court = req.query['court'];
    if (court !== undefined && typeof court !== 'string') throw new ValidationError('invalid court');
    const limitRaw = req.query['limit'];
    const limit = limitRaw !== undefined ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
      throw new ValidationError('limit must be 1..200');
    }
    ok(res, {
      stats:    verdictCorpus.stats(),
      verdicts: verdictCorpus.listRecent({ ...(court ? { court } : {}), ...(limit ? { limit } : {}) }),
    });
  }));

  router.get('/search', asyncHandler((req, res) => {
    const q = req.query['q'];
    if (typeof q !== 'string' || q.trim() === '') throw new ValidationError('q is required');
    const court = req.query['court'];
    if (court !== undefined && typeof court !== 'string') throw new ValidationError('invalid court');
    ok(res, verdictCorpus.searchVerdicts(q, court ? { court } : {}));
  }));

  router.get('/verdicts/:docKey', asyncHandler((req, res) => {
    const docKey = decodeURIComponent(req.params['docKey'] ?? '');
    const verdict = verdictCorpus.getByDocKey(docKey);
    if (!verdict) throw new NotFoundError('verdict not found');
    ok(res, verdict);
  }));

  return router;
}
