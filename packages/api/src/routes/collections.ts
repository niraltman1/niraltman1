import { Router } from 'express';
import type { Repos } from '../db.js';
import type { SmartCollectionKey } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError } from '../errors/api-error.js';

const VALID: SmartCollectionKey[] = ['unverified', 'recent', 'ocr_pending', 'hearing'];

/** Smart Collections (M7): GET /api/collections , GET /api/collections/:key */
export function collectionsRouter(repos: Repos): Router {
  const router = Router();
  const { smartCollections } = repos;

  router.get('/', asyncHandler((_req, res) => {
    ok(res, smartCollections.overview());
  }));

  router.get('/:key', asyncHandler((req, res) => {
    const key = req.params['key'] as SmartCollectionKey;
    if (!VALID.includes(key)) throw new ValidationError('unknown collection');
    ok(res, smartCollections.items(key));
  }));

  return router;
}
