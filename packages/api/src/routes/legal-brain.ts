/**
 * Legal Brain — multi-turn conversational legal research assistant.
 *
 *   POST   /api/legal-brain/sessions              — create conversation session
 *   GET    /api/legal-brain/sessions              — list sessions for a user
 *   GET    /api/legal-brain/sessions/:id          — get session + all messages
 *   POST   /api/legal-brain/sessions/:id/ask      — SSE streaming query
 *   DELETE /api/legal-brain/sessions/:id          — delete session + messages
 *   POST   /api/legal-brain/messages/:id/feedback — rate an assistant response
 */

import { z } from 'zod';
import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { validate } from '../middleware/validate.js';
import { ask } from '../modules/legal-brain/service.js';

const createSessionSchema = z.object({
  userId: z.string().optional(),
  caseId: z.number().int().positive().optional(),
  title:  z.string().max(500).optional(),
});

export function legalBrainRouter(repos: Repos): Router {
  const router = Router();
  const { legalBrainSessions, legalCorpus, db } = repos;

  // ── Session management ────────────────────────────────────────────────────

  router.post('/sessions', validate(createSessionSchema), asyncHandler((req, res) => {
    const { userId, caseId, title } = req.body as z.infer<typeof createSessionSchema>;
    const session = legalBrainSessions.createSession({
      ...(userId !== undefined ? { userId } : {}),
      ...(caseId !== undefined ? { caseId } : {}),
      ...(title  !== undefined ? { title  } : {}),
    });
    ok(res, session, 201);
  }));

  router.get('/sessions', asyncHandler((req, res) => {
    const userId = typeof req.query['userId'] === 'string' ? req.query['userId'] : 'default';
    const rawLimit = Number(req.query['limit']);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const sessions = legalBrainSessions.listSessions(userId, limit);
    ok(res, sessions);
  }));

  router.get('/sessions/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid session id');
    const session = legalBrainSessions.getSession(id);
    if (!session) throw new NotFoundError('session not found');
    const messages = legalBrainSessions.getMessages(id);
    ok(res, { session, messages });
  }));

  router.delete('/sessions/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid session id');
    const session = legalBrainSessions.getSession(id);
    if (!session) throw new NotFoundError('session not found');
    legalBrainSessions.deleteSession(id);
    ok(res, { deleted: true });
  }));

  // ── Streaming query (SSE) ─────────────────────────────────────────────────

  router.post('/sessions/:id/ask', (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid session id' });
      return;
    }

    const session = legalBrainSessions.getSession(id);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const { query, caseId } = req.body as { query?: string; caseId?: number };
    if (typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    void (async () => {
      try {
        const resolvedCaseId = session.caseId ?? (Number.isFinite(Number(caseId)) ? Number(caseId) : undefined);
        for await (const event of ask(
          {
            query: query.trim(),
            sessionId: id,
            ...(resolvedCaseId !== undefined ? { caseId: resolvedCaseId } : {}),
          },
          db,
          legalCorpus,
          legalBrainSessions,
          controller.signal,
        )) {
          if (res.writableEnded) break;
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
        }
      } catch (e) {
        if (!res.writableEnded) {
          const msg = e instanceof Error ? e.message : String(e);
          res.write(`event: error\ndata: ${JSON.stringify({ code: 'INTERNAL', message: msg })}\n\n`);
        }
      } finally {
        if (!res.writableEnded) res.end();
      }
    })();
  });

  // ── Feedback ──────────────────────────────────────────────────────────────

  router.post('/messages/:id/feedback', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid message id');
    const { helpful } = req.body as { helpful?: unknown };
    if (helpful !== 0 && helpful !== 1) throw new ValidationError('helpful must be 0 or 1');
    legalBrainSessions.setFeedback(id, helpful as 0 | 1);
    ok(res, { ok: true });
  }));

  return router;
}
