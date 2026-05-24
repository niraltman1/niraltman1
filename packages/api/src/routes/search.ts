import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';

export function searchRouter(repos: Repos): Router {
  const router = Router();
  const { search } = repos;

  router.get('/', asyncHandler((req, res) => {
    const q     = String(req.query['q'] ?? '').trim();
    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 20)));
    if (!q) {
      ok(res, []);
      return;
    }
    const hits = search.search(q, { limit });
    ok(res, hits);
  }));

  return router;
}
