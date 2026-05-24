import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';

interface ActivityRow {
  id:           number;
  kind:         string;
  case_id:      number | null;
  document_id:  number | null;
  source:       string | null;
  confidence:   number | null;
  message:      string | null;
  details_json: string | null;
  emitted_at:   string;
}

function parseRow(row: ActivityRow): unknown {
  return {
    id:         row.id,
    kind:       row.kind,
    caseId:     row.case_id,
    documentId: row.document_id,
    source:     row.source,
    confidence: row.confidence,
    message:    row.message,
    details:    row.details_json ? JSON.parse(row.details_json) : null,
    emittedAt:  row.emitted_at,
  };
}

export function activityRouter(repos: Repos): Router {
  const router = Router();

  router.get('/', asyncHandler((req, res) => {
    const limit = Math.min(Number(req.query['limit'] ?? 50), 500);
    const kind  = req.query['kind'] as string | undefined;
    const since = req.query['since'] as string | undefined;
    const caseId = req.query['caseId'] ? Number(req.query['caseId']) : undefined;

    const filters: string[] = [];
    const params: unknown[]  = [];
    if (kind)              { filters.push('kind = ?');        params.push(kind); }
    if (since)             { filters.push('emitted_at >= ?'); params.push(since); }
    if (caseId !== undefined) { filters.push('case_id = ?'); params.push(caseId); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const rows = repos.db.prepare(`
      SELECT * FROM activity_events ${where}
      ORDER BY emitted_at DESC, id DESC LIMIT ?
    `).all(...params, limit) as ActivityRow[];

    ok(res, rows.map(parseRow));
  }));

  router.get('/case/:caseId', asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    if (!Number.isFinite(caseId)) {
      ok(res, []);
      return;
    }
    const limit = Math.min(Number(req.query['limit'] ?? 100), 500);
    const rows = repos.db.prepare(`
      SELECT * FROM activity_events WHERE case_id = ?
      ORDER BY emitted_at DESC, id DESC LIMIT ?
    `).all(caseId, limit) as ActivityRow[];
    ok(res, rows.map(parseRow));
  }));

  router.get('/document/:documentId', asyncHandler((req, res) => {
    const documentId = Number(req.params['documentId']);
    if (!Number.isFinite(documentId)) {
      ok(res, []);
      return;
    }
    const rows = repos.db.prepare(`
      SELECT * FROM activity_events WHERE document_id = ?
      ORDER BY emitted_at DESC, id DESC LIMIT 100
    `).all(documentId) as ActivityRow[];
    ok(res, rows.map(parseRow));
  }));

  return router;
}
