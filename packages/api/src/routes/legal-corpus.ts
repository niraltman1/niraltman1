import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

/**
 * Read surface over the verbatim legal knowledge base (migration 061).
 * Every result carries its source — hits are never blended across laws.
 *   GET /api/legal-corpus/sources           — list laws + KB stats
 *   GET /api/legal-corpus/sources/:key       — one law + its verbatim sections
 *   GET /api/legal-corpus/search?q=&source=  — keyword search over verbatim sections
 */
export function legalCorpusRouter(repos: Repos): Router {
  const router = Router();
  const { legalCorpus } = repos;

  router.get('/sources', asyncHandler((_req, res) => {
    ok(res, { stats: legalCorpus.stats(), sources: legalCorpus.listSources() });
  }));

  router.get('/search', asyncHandler((req, res) => {
    const q = req.query['q'];
    if (typeof q !== 'string' || q.trim() === '') throw new ValidationError('q is required');
    const source = req.query['source'];
    if (source !== undefined && typeof source !== 'string') throw new ValidationError('invalid source');
    ok(res, legalCorpus.searchSections(q, source ? { sourceKey: source } : {}));
  }));

  router.get('/sources/:key', asyncHandler((req, res) => {
    const key = decodeURIComponent(req.params['key'] ?? '');
    const source = legalCorpus.getSourceByKey(key);
    if (!source) throw new NotFoundError('source not found');
    ok(res, { source, sections: legalCorpus.getSections(source.id) });
  }));

  return router;
}
