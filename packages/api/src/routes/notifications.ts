import { z } from 'zod';
import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { positiveIntParam, validateRequest } from '../utils/request-validation.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const idParamSchema = z.object({
  id: positiveIntParam,
});


export function notificationsRouter(repos: Repos): Router {
  const router = Router();
  const { notifications } = repos;

  // GET /api/notifications?limit=50 → { items, unread }
  router.get('/', validate(listQuerySchema, 'query'), asyncHandler((req, res) => {
    const { limit } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const items = notifications.listRecent(limit);
    const unread = notifications.unreadCount();
    ok(res, { items, unread });
  }));

  // POST /api/notifications/read-all → mark every unread notification read
  router.post('/read-all', asyncHandler((_req, res) => {
    const changed = notifications.markAllRead();
    ok(res, { changed });
  }));

  // POST /api/notifications/:id/read → mark one notification read
  router.post('/:id/read', asyncHandler((req, res) => {
    const { id } = validateRequest(idParamSchema, req.params);
    notifications.markRead(id);
    ok(res, { ok: true });
  }));

  return router;
}
