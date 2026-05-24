/**
 * GET /api/ai/stream?prompt=...&model=law-il-E2B
 *
 * Server-Sent Events endpoint that streams tokens from Ollama to the dashboard.
 *
 * - Requires Bearer auth (requireAuth).
 * - Applies prompt injection check before forwarding to Ollama.
 * - Each SSE message is a single token: `data: <token>\n\n`
 * - On completion: `data: [DONE]\n\n`
 * - On error: `data: [ERROR] <message>\n\n`
 */

import { Router } from 'express';
import { streamGenerate } from '@factum-il/ai';
import { isolateInjection } from '@factum-il/ai-guardrails';
import { requireAuth } from '../middleware/auth.js';
import type { Repos } from '../db.js';

export function aiStreamRouter(repos: Repos): Router {
  const router = Router();

  router.get('/stream', requireAuth(repos), (req, res) => {
    const prompt = typeof req.query['prompt'] === 'string' ? req.query['prompt'] : '';

    if (!prompt) {
      res.status(400).json({ error: 'prompt query parameter is required' });
      return;
    }

    // Prompt injection guard — reject before touching Ollama
    const injectionCheck = isolateInjection(prompt);
    if (injectionCheck.status === 'fail') {
      res.status(400).json({ error: 'Invalid prompt' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Use an AbortController so we can cancel the Ollama stream if the client disconnects
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    void (async () => {
      try {
        for await (const token of streamGenerate(prompt, { signal: controller.signal })) {
          if (res.writableEnded) break;
          res.write(`data: ${token}\n\n`);
        }
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (e) {
        if (!res.writableEnded) {
          const message = e instanceof Error ? e.message : String(e);
          res.write(`data: [ERROR] ${message}\n\n`);
          res.end();
        }
      }
    })();
  });

  return router;
}
