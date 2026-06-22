import { z } from 'zod';
import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { isoDateString } from '../utils/request-validation.js';

const eventsQuerySchema = z.object({
  from: isoDateString,
  to:   isoDateString,
}).refine(d => d.from <= d.to, { message: 'from must be on or before to', path: ['from'] });

const deadlinesQuerySchema = z.object({
  horizon: z.coerce.number().int().min(1).max(365).default(90),
});

export function calendarRouter(repos: Repos): Router {
  const router = Router();
  const { calendar } = repos;

  // GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/events', validate(eventsQuerySchema, 'query'), asyncHandler((req, res) => {
    const { from, to } = req.query as unknown as z.infer<typeof eventsQuerySchema>;
    ok(res, calendar.eventsInRange(from, to));
  }));

  // GET /api/calendar/deadlines?horizon=90  → liability radar (§4.4.3)
  router.get('/deadlines', validate(deadlinesQuerySchema, 'query'), asyncHandler((req, res) => {
    const { horizon } = req.query as unknown as z.infer<typeof deadlinesQuerySchema>;
    const today = new Date().toISOString().slice(0, 10);
    ok(res, calendar.deadlinesAtRisk(today, horizon));
  }));

  return router;
}
