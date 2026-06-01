import { Router } from 'express';
import { normalizeJudge, normalizeCourt } from '@factum-il/legal-ontology';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { summarizeEntities, entityDetail } from '../utils/entity-grouping.js';

/**
 * Entity-Centric Navigation (M6). Judges/courts derived on-read from existing
 * free-text and normalized via legal-ontology — clickable entities without a
 * pipeline change. Routes:
 *   GET /api/entities/judges          GET /api/entities/judges/:name
 *   GET /api/entities/courts          GET /api/entities/courts/:name
 */
export function entitiesRouter(repos: Repos): Router {
  const router = Router();
  const { entities } = repos;

  router.get('/judges', asyncHandler((_req, res) => {
    ok(res, summarizeEntities(entities.judgeReferences(), normalizeJudge));
  }));

  router.get('/judges/:name', asyncHandler((req, res) => {
    const name = decodeURIComponent(req.params['name'] ?? '');
    ok(res, entityDetail(entities.judgeReferences(), name, normalizeJudge));
  }));

  router.get('/courts', asyncHandler((_req, res) => {
    ok(res, summarizeEntities(entities.courtReferences(), normalizeCourt));
  }));

  router.get('/courts/:name', asyncHandler((req, res) => {
    const name = decodeURIComponent(req.params['name'] ?? '');
    ok(res, entityDetail(entities.courtReferences(), name, normalizeCourt));
  }));

  return router;
}
