import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError } from '../errors/api-error.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function calendarRouter(repos: Repos): Router {
  const router = Router();
  const { calendar } = repos;

  // GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/events', asyncHandler((req, res) => {
    const from = String(req.query['from'] ?? '');
    const to   = String(req.query['to'] ?? '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new ValidationError('from and to must be YYYY-MM-DD dates');
    }
    if (from > to) {
      throw new ValidationError('from must be on or before to');
    }
    ok(res, calendar.eventsInRange(from, to));
  }));

  // GET /api/calendar/deadlines?horizon=90  → liability radar (§4.4.3)
  router.get('/deadlines', asyncHandler((req, res) => {
    const raw = Number(req.query['horizon']);
    const horizon = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 90;
    const today = new Date().toISOString().slice(0, 10);
    ok(res, calendar.deadlinesAtRisk(today, horizon));
  }));

  return router;
}
