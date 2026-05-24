import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';

const createTaskSchema = z.object({
  title:       z.string().min(1),
  description: z.string().nullish(),
  dueDate:     z.string().nullish(),
  priority:    z.enum(['low', 'normal', 'high', 'critical']).optional(),
}).strict();

export function canvasRouter(repos: Repos): Router {
  const router = Router();

  router.get('/document/:id', asyncHandler(async (req, res) => {
    const id  = Number(req.params['id']);
    const doc = repos.documents.findById(id);
    if (!doc) throw new NotFoundError(`document ${id}`);

    const insights = repos.db.prepare(
      `SELECT * FROM DocumentInsights WHERE document_id = ?`,
    ).get(id) as Record<string, unknown> | undefined;

    const tasks = repos.db.prepare(`
      SELECT * FROM Tasks WHERE document_id = ? ORDER BY created_at DESC
    `).all(id) as Record<string, unknown>[];

    ok(res, { document: doc, insights: insights ?? null, tasks });
  }));

  router.get('/document/:id/tasks', asyncHandler(async (req, res) => {
    const id    = Number(req.params['id']);
    const tasks = repos.db.prepare(
      `SELECT * FROM Tasks WHERE document_id = ? ORDER BY created_at DESC`,
    ).all(id) as Record<string, unknown>[];
    ok(res, tasks);
  }));

  router.post('/document/:id/tasks', validate(createTaskSchema), asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const body = req.body as z.infer<typeof createTaskSchema>;

    const doc = repos.documents.findById(id);
    if (!doc) throw new NotFoundError(`document ${id}`);

    const createInput: import('@factum-il/shared').TaskCreateInput = {
      title:      body.title,
      source:     'manual',
      documentId: id,
      ...(body.description != null ? { description: body.description } : {}),
      ...(body.dueDate     != null ? { dueDate:     body.dueDate }     : {}),
      ...(body.priority    != null ? { priority:    body.priority }    : {}),
    };
    const task = repos.tasks.create(createInput);

    ok(res, task, 201);
  }));

  return router;
}
