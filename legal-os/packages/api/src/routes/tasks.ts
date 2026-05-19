import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
} from '../validation/tasks.js';
import type { TaskCreateInput, TaskUpdateInput } from '@legal-os/shared';

export function tasksRouter(repos: Repos): Router {
  const router = Router();
  const { tasks } = repos;

  router.get('/', validate(listTasksQuerySchema, 'query'), asyncHandler((req, res) => {
    const q = req.query as Record<string, unknown>;
    const listOpts: Parameters<typeof tasks.list>[0] = {};
    if (q['status'])   listOpts.status   = q['status'] as string;
    if (q['clientId']) listOpts.clientId = Number(q['clientId']);
    if (q['caseId'])   listOpts.caseId   = Number(q['caseId']);
    listOpts.page  = q['page']     ? Number(q['page'])     : 1;
    listOpts.limit = q['pageSize'] ? Number(q['pageSize']) : 50;
    const result = tasks.list(listOpts);
    ok(res, result);
  }));

  router.post('/', validate(createTaskSchema), asyncHandler((req, res) => {
    const task = tasks.create(req.body as TaskCreateInput);
    ok(res, task, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const id   = Number(req.params['id']);
    const task = tasks.findById(id);
    if (!task) throw new NotFoundError('Task');
    ok(res, task);
  }));

  router.patch('/:id', validate(updateTaskSchema), asyncHandler((req, res) => {
    const id      = Number(req.params['id']);
    const updated = tasks.update(id, req.body as TaskUpdateInput);
    if (!updated) throw new NotFoundError('Task');
    ok(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const id   = Number(req.params['id']);
    const task = tasks.findById(id);
    if (!task) throw new NotFoundError('Task');
    tasks.delete(id);
    ok(res, { deleted: id });
  }));

  return router;
}
