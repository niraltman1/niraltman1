import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import type { SmartCollectionKey } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

const VALID: SmartCollectionKey[] = ['unverified', 'recent', 'ocr_pending', 'hearing'];

const savedFilterSchema = z.object({
  nameHe:     z.string().min(1).max(80),
  filterJson: z.string().default('{}'),
}).strict();

interface SavedFilterParams {
  documentType?:    string;
  processingState?: string;
  caseId?:          number;
  clientId?:        number;
}

/** Smart Collections + Saved Filters: GET/POST/DELETE /api/collections */
export function collectionsRouter(repos: Repos): Router {
  const router = Router();
  const { smartCollections, savedFilters, db } = repos;

  // ── System smart collections ──────────────────────────────────────────────
  router.get('/', asyncHandler((_req, res) => {
    ok(res, smartCollections.overview());
  }));

  // ── Saved Filters (user-defined) — must come before /:key ────────────────
  router.get('/saved', asyncHandler((_req, res) => {
    ok(res, savedFilters.list());
  }));

  router.post('/saved', validate(savedFilterSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof savedFilterSchema>;
    ok(res, savedFilters.create({ nameHe: body.nameHe, filterJson: body.filterJson }), 201);
  }));

  router.delete('/saved/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!savedFilters.delete(id)) throw new NotFoundError('saved filter not found');
    ok(res, { deleted: true });
  }));

  router.get('/saved/:id/items', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const filter = savedFilters.list().find((f) => f.id === id);
    if (!filter) throw new NotFoundError('saved filter not found');

    let params: SavedFilterParams;
    try { params = JSON.parse(filter.filterJson) as SavedFilterParams; }
    catch { params = {}; }

    const conditions: string[] = [];
    const bindings: (string | number)[] = [];
    if (params.documentType)    { conditions.push('document_type = ?');    bindings.push(params.documentType); }
    if (params.processingState) { conditions.push('processing_state = ?'); bindings.push(params.processingState); }
    if (params.caseId)          { conditions.push('case_id = ?');           bindings.push(params.caseId); }
    if (params.clientId)        { conditions.push('client_id = ?');         bindings.push(params.clientId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const items = db.prepare(`SELECT * FROM Documents ${where} ORDER BY created_at DESC LIMIT 100`).all(...bindings) as Record<string, unknown>[];
    ok(res, items);
  }));

  // ── System key route (legacy /:key) ──────────────────────────────────────
  router.get('/:key', asyncHandler((req, res) => {
    const key = req.params['key'] as SmartCollectionKey;
    if (!VALID.includes(key)) throw new ValidationError('unknown collection key');
    ok(res, smartCollections.items(key));
  }));

  return router;
}
