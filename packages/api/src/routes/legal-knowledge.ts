/**
 * /api/legal — Unified Legal Knowledge API
 *
 * Application features access all legal knowledge through this single surface.
 * Dataset boundaries are implementation details not exposed to consumers.
 *
 * Routes:
 *   GET  /api/legal/stats               — corpus stats
 *   GET  /api/legal/sources             — registered source registry
 *   GET  /api/legal/documents           — list / browse canonical documents
 *   GET  /api/legal/documents/:id       — single document by FDOC-XXXXXXXX
 *   GET  /api/legal/search?q=           — unified FTS5 keyword search
 *   GET  /api/legal/citations/:id       — citations from / to a document
 *   GET  /api/legal/graph/top-cited     — most cited documents
 *   GET  /api/legal/ingestion/progress  — ingestion progress (first-boot status)
 */

import { Router } from 'express';
import type { LegalKnowledgeService } from '../services/legal-knowledge-service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

export function legalKnowledgeRouter(svc: LegalKnowledgeService): Router {
  const router = Router();

  // ── Stats ────────────────────────────────────────────────────────────────
  router.get('/stats', asyncHandler((_req, res) => {
    ok(res, { stats: svc.stats(), citationStats: svc.citationStats() });
  }));

  // ── Source Registry ──────────────────────────────────────────────────────
  router.get('/sources', asyncHandler((_req, res) => {
    ok(res, svc.listSources());
  }));

  router.get('/sources/:sourceId', asyncHandler((req, res) => {
    const sourceId = decodeURIComponent(req.params['sourceId'] ?? '');
    const source = svc.getSource(sourceId);
    if (!source) throw new NotFoundError('source not found');
    ok(res, source);
  }));

  // ── Document List ────────────────────────────────────────────────────────
  router.get('/documents', asyncHandler((req, res) => {
    const court         = req.query['court'];
    const sourceDataset = req.query['source'];
    const documentType  = req.query['type'];
    const limitRaw      = req.query['limit'];
    const offsetRaw     = req.query['offset'];

    if (court !== undefined && typeof court !== 'string') throw new ValidationError('invalid court');
    if (sourceDataset !== undefined && typeof sourceDataset !== 'string') throw new ValidationError('invalid source');

    const limit  = limitRaw  !== undefined ? Math.min(200, Math.max(1, Number(limitRaw)))  : 50;
    const offset = offsetRaw !== undefined ? Math.max(0, Number(offsetRaw)) : 0;

    if (!Number.isFinite(limit) || !Number.isFinite(offset)) throw new ValidationError('invalid pagination');

    ok(res, svc.listDocuments({
      court:         typeof court         === 'string' ? court         : undefined,
      sourceDataset: typeof sourceDataset === 'string' ? sourceDataset : undefined,
      documentType:  typeof documentType  === 'string' ? documentType as never : undefined,
      limit,
      offset,
    }));
  }));

  // ── Single Document ──────────────────────────────────────────────────────
  router.get('/documents/:documentId', asyncHandler((req, res) => {
    const documentId = req.params['documentId'] ?? '';
    if (!documentId.startsWith('FDOC-')) throw new ValidationError('invalid document ID format');
    const doc = svc.getDocument(documentId);
    if (!doc) throw new NotFoundError('document not found');
    ok(res, doc);
  }));

  // ── Unified Search ───────────────────────────────────────────────────────
  router.get('/search', asyncHandler((req, res) => {
    const q = req.query['q'];
    if (typeof q !== 'string' || q.trim() === '') throw new ValidationError('q is required');

    const court         = req.query['court'];
    const sourceDataset = req.query['source'];
    const documentType  = req.query['type'];
    const limitRaw      = req.query['limit'];
    const limit         = limitRaw !== undefined ? Math.min(50, Math.max(1, Number(limitRaw))) : 20;

    if (!Number.isFinite(limit)) throw new ValidationError('invalid limit');

    ok(res, svc.search(q, {
      court:         typeof court         === 'string' ? court         : undefined,
      sourceDataset: typeof sourceDataset === 'string' ? sourceDataset : undefined,
      documentType:  typeof documentType  === 'string' ? documentType as never : undefined,
      limit,
    }));
  }));

  // ── Citation Graph ───────────────────────────────────────────────────────
  router.get('/citations/:documentId', asyncHandler((req, res) => {
    const documentId = req.params['documentId'] ?? '';
    if (!documentId.startsWith('FDOC-')) throw new ValidationError('invalid document ID format');

    ok(res, {
      from: svc.getCitationsFrom(documentId),
      to:   svc.getCitationsTo(documentId),
    });
  }));

  router.get('/graph/top-cited', asyncHandler((req, res) => {
    const limitRaw = req.query['limit'];
    const limit    = limitRaw !== undefined ? Math.min(50, Math.max(1, Number(limitRaw))) : 20;
    if (!Number.isFinite(limit)) throw new ValidationError('invalid limit');
    ok(res, svc.topCitedDocuments(limit));
  }));

  // ── Ingestion Progress ───────────────────────────────────────────────────
  router.get('/ingestion/progress', asyncHandler((req, res) => {
    const sourceId = req.query['source'];
    if (sourceId !== undefined && typeof sourceId !== 'string') throw new ValidationError('invalid source');

    if (typeof sourceId === 'string') {
      ok(res, svc.getIngestionProgress(sourceId));
    } else {
      ok(res, svc.getAllProgress());
    }
  }));

  return router;
}
