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
 *   GET  /api/entities/graph           — nodes + edges for graph visualisation (max 60 nodes)
 *   GET  /api/entities/graph/stats     — persisted-graph counts (observability)
 *   POST /api/entities/backfill        — populate the graph from existing insights
 */
export function entitiesRouter(repos: Repos): Router {
  const router = Router();
  const { entities } = repos;

  // Full graph for visualisation — nodes with degree, edges. Must come before /graph/stats.
  router.get('/graph', asyncHandler((_req, res) => {
    const nodes = repos.db.prepare(`
      SELECT e.id, e.kind, e.canonical,
             COUNT(DISTINCT er1.to_id) + COUNT(DISTINCT er2.from_id) AS degree
        FROM Entities e
        LEFT JOIN EntityRelations er1 ON er1.from_id = e.id
        LEFT JOIN EntityRelations er2 ON er2.to_id   = e.id
       GROUP BY e.id
       ORDER BY degree DESC, e.id ASC
       LIMIT 60
    `).all() as { id: number; kind: string; canonical: string; degree: number }[];

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = repos.db.prepare(`
      SELECT er.from_id AS source, er.to_id AS target, er.relation
        FROM EntityRelations er
       WHERE er.from_id IN (${nodeIds.size ? [...nodeIds].join(',') : 'NULL'})
         AND er.to_id   IN (${nodeIds.size ? [...nodeIds].join(',') : 'NULL'})
    `).all() as { source: number; target: number; relation: string }[];

    ok(res, { nodes, edges });
  }));

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
