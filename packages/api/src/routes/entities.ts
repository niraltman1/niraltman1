import { Router } from 'express';
import { normalizeJudge, normalizeCourt } from '@factum-il/legal-ontology';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { summarizeEntities, entityDetail } from '../utils/entity-grouping.js';
import { backfillEntityGraph, entityGraphStats } from '../utils/entity-graph.js';

/**
 * Entity-Centric Navigation (M6) + persistent knowledge graph.
 * Judges/courts are derived on-read from free-text (M6), AND persisted into the
 * Entities/EntityRelations graph during enrichment (rag-worker → populateEntityGraph).
 *   GET  /api/entities/judges          GET /api/entities/judges/:name
 *   GET  /api/entities/courts          GET /api/entities/courts/:name
 *   GET  /api/entities/graph/stats     — persisted-graph counts (observability)
 *   POST /api/entities/backfill        — populate the graph from existing insights
 */
export function entitiesRouter(repos: Repos): Router {
  const router = Router();
  const { entities } = repos;

  // Persisted knowledge-graph stats — registered before /:name routes (distinct path).
  router.get('/graph/stats', asyncHandler((_req, res) => {
    ok(res, entityGraphStats(repos.db));
  }));

  // One-shot backfill from existing DocumentInsights into the persisted graph.
  router.post('/backfill', asyncHandler((_req, res) => {
    ok(res, backfillEntityGraph(repos.db));
  }));

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
