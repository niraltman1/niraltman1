import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError } from '../errors/api-error.js';

export function notificationsRouter(repos: Repos): Router {
  const router = Router();
  const { notifications } = repos;

  // GET /api/notifications?limit=50 → { items, unread }
  router.get('/', asyncHandler((req, res) => {
    const raw = Number(req.query['limit']);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 200) : 50;
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
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    notifications.markRead(id);
    ok(res, { ok: true });
  }));

  return router;
}
