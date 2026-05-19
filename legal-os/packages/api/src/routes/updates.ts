import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { fetchContentBundle, applyContentBundle } from '../modules/updates/content-updater.js';

const logUpdateSchema = z.object({
  channel: z.enum(['security', 'content']),
  version: z.string().optional(),
  status:  z.enum(['success', 'failed', 'skipped']),
  details: z.unknown().optional(),
  error:   z.string().nullish(),
}).strict();

export function updatesRouter(repos: Repos): Router {
  const router = Router();

  router.get('/status', asyncHandler(async (_req, res) => {
    const security = repos.db.prepare(
      `SELECT * FROM UpdateLog WHERE channel = 'security' ORDER BY applied_at DESC LIMIT 5`,
    ).all() as Record<string, unknown>[];
    const content = repos.db.prepare(
      `SELECT * FROM UpdateLog WHERE channel = 'content'  ORDER BY applied_at DESC LIMIT 5`,
    ).all() as Record<string, unknown>[];
    ok(res, { security, content });
  }));

  router.post('/log', validate(logUpdateSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof logUpdateSchema>;
    repos.db.prepare(
      `INSERT INTO UpdateLog (channel, version, status, details, error) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      body.channel,
      body.version  ?? null,
      body.status,
      body.details  != null ? JSON.stringify(body.details) : null,
      body.error    ?? null,
    );
    ok(res, { logged: true });
  }));

  router.post('/content/trigger', asyncHandler(async (_req, res) => {
    const url = process.env['CONTENT_UPDATE_URL'];
    if (!url) {
      ok(res, { skipped: true, reason: 'CONTENT_UPDATE_URL not configured' });
      return;
    }
    const bundle = await fetchContentBundle(url);
    if (!bundle) {
      ok(res, { skipped: true, reason: 'bundle fetch failed' });
      return;
    }
    const result = await applyContentBundle(repos, bundle);
    ok(res, { version: bundle.version, ...result });
  }));

  return router;
}
