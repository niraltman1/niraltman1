import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { getAuthUrl, exchangeCode } from '../modules/gmail/gmail-oauth.js';
import { runGmailSync } from '../modules/gmail/gmail-syncer.js';

const callbackSchema = z.object({
  code:          z.string().min(1),
  gmail_address: z.string().min(1),
  label_filter:  z.string().optional(),
}).strict();

function gmailDisabled(res: import('express').Response): boolean {
  if (process.env['GMAIL_ENABLED'] !== 'true') {
    res.status(503).json({ success: false, error: { code: 'GMAIL_DISABLED', message: 'Gmail integration is disabled' } });
    return true;
  }
  return false;
}

export function gmailRouter(repos: Repos): Router {
  const router = Router();

  router.get('/auth-url', asyncHandler((_req, res) => {
    if (gmailDisabled(res)) return;
    ok(res, { url: getAuthUrl() });
  }));

  router.post('/callback', validate(callbackSchema), asyncHandler(async (req, res) => {
    if (gmailDisabled(res)) return;
    const { code, gmail_address, label_filter } = req.body as z.infer<typeof callbackSchema>;
    const tokenStore = await exchangeCode(code);
    const configId = repos.gmail.createConfig({
      gmail_address,
      ...(label_filter ? { label_filter } : {}),
      encrypted_token: tokenStore.encrypted_token,
      token_iv:        tokenStore.token_iv,
      token_tag:       tokenStore.token_tag,
    });
    ok(res, { configId }, 201);
  }));

  router.get('/configs', asyncHandler((_req, res) => {
    if (gmailDisabled(res)) return;
    const configs = repos.gmail.listConfigs().map(({ encrypted_token: _t, token_iv: _iv, token_tag: _tg, ...safe }) => safe);
    ok(res, configs);
  }));

  router.post('/configs/:id/sync', asyncHandler(async (req, res) => {
    if (gmailDisabled(res)) return;
    const id = Number(req.params['id']);
    const result = await runGmailSync(repos, id);
    ok(res, result);
  }));

  router.delete('/configs/:id', asyncHandler((req, res) => {
    if (gmailDisabled(res)) return;
    const id = Number(req.params['id']);
    repos.gmail.deleteConfig(id);
    ok(res, { deleted: true });
  }));

  router.get('/configs/:id/logs', asyncHandler((req, res) => {
    if (gmailDisabled(res)) return;
    const id    = Number(req.params['id']);
    const limit = req.query['limit'] ? Number(req.query['limit']) : 10;
    ok(res, repos.gmail.listLogs(id, limit));
  }));

  router.get('/status', asyncHandler((_req, res) => {
    const enabled = process.env['GMAIL_ENABLED'] === 'true';
    if (!enabled) {
      ok(res, { enabled: false, configCount: 0, lastSync: null });
      return;
    }
    const configs   = repos.gmail.listConfigs();
    const lastSyncs = configs.map((c) => c.last_sync_at).filter(Boolean) as string[];
    const lastSync  = lastSyncs.length > 0 ? lastSyncs.sort().reverse()[0]! : null;
    ok(res, { enabled: true, configCount: configs.length, lastSync });
  }));

  return router;
}
