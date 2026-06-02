import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

/**
 * Read-only surface over the Rules_Engine registry (§4.7.1). Procedural deadlines
 * are seeded in the database (migration 060) and read here — never hardcoded.
 */
export function rulesRouter(repos: Repos): Router {
  const router = Router();
  const { rules } = repos;

  // GET /api/rules/types → distinct procedure types with rule counts
  router.get('/types', asyncHandler((_req, res) => {
    ok(res, rules.procedureTypes());
  }));

  // GET /api/rules?procedureType=civil → active rules, optionally filtered
  router.get('/', asyncHandler((req, res) => {
    const procedureType = req.query['procedureType'];
    if (procedureType !== undefined && typeof procedureType !== 'string') {
      throw new ValidationError('invalid procedureType');
    }
    ok(res, rules.listAll(procedureType));
  }));

  // GET /api/rules/:id → a single rule
  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const rule = rules.findById(id);
    if (!rule) throw new NotFoundError('rule not found');
    ok(res, rule);
  }));

  return router;
}
