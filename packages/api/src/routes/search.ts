import { z } from 'zod';
import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';

const searchQuerySchema = z.object({
  q:     z.string(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function searchRouter(repos: Repos): Router {
  const router = Router();
  const { search } = repos;

  router.get('/', validate(searchQuerySchema, 'query'), asyncHandler((req, res) => {
    const { q, limit } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    if (!q.trim()) { ok(res, []); return; }
    const hits = search.search(q, { limit });
    ok(res, hits);
  }));

  return router;
}
