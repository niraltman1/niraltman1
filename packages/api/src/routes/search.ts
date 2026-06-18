import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';

const searchQuerySchema = z.object({
  q:     z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function searchRouter(repos: Repos): Router {
  const router = Router();
  const { search } = repos;

  router.get('/', validate(searchQuerySchema, 'query'), asyncHandler((req, res) => {
    const q = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const query = (q.q ?? '').trim();
    const limit = q.limit ?? 20;
    if (!query) {
      ok(res, []);
      return;
    }
    const hits = search.search(query, { limit });
    ok(res, hits);
  }));

  return router;
}
