import { Router } from 'express';
import type { z } from 'zod';
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
import type { TaskCreateInput, TaskUpdateInput } from '@factum-il/shared';

export function tasksRouter(repos: Repos): Router {
  const router = Router();
  const { tasks } = repos;

  router.get('/', validate(listTasksQuerySchema, 'query'), asyncHandler((req, res) => {
    const q = req.query as unknown as z.infer<typeof listTasksQuerySchema>;
    const listOpts: Parameters<typeof tasks.list>[0] = {};
    if (q.status === 'overdue') {
      listOpts.overdue = true;
    } else if (q.status) {
      listOpts.status = q.status;
    }
    if (q.clientId) listOpts.clientId = q.clientId;
    if (q.caseId)   listOpts.caseId   = q.caseId;
    listOpts.page  = q.page     ?? 1;
    listOpts.limit = q.pageSize ?? 50;
    const result = tasks.list(listOpts);
    ok(res, result);
  }));

  router.post('/', validate(createTaskSchema), asyncHandler((req, res) => {
    // validate() guarantees the runtime shape; the extra cast bridges the
    // zod-inferred type's `| undefined` optionals to TaskCreateInput under
    // exactOptionalPropertyTypes.
    const task = tasks.create(req.body as z.infer<typeof createTaskSchema> as TaskCreateInput);
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
    const updated = tasks.update(id, req.body as z.infer<typeof updateTaskSchema> as TaskUpdateInput);
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
