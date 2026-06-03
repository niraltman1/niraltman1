import { Router } from 'express';
import type { Repos } from '../db.js';
import type { AnnotationCreateInput } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';

const ANNOTATION_TYPES = ['highlight', 'note', 'redline', 'bookmark'] as const;
type AnnotationType = (typeof ANNOTATION_TYPES)[number];

function isAnnotationType(v: unknown): v is AnnotationType {
  return typeof v === 'string' && (ANNOTATION_TYPES as readonly string[]).includes(v);
}

function optionalNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError('expected a numeric value');
  return n;
}

/**
 * Document annotations — notes, bookmarks, redlines and (coordinate-based) highlights.
 * Local-first: no auth, mirrors the queue/tasks/notifications route convention.
 * Pixel-accurate highlight coordinates are accepted but not yet produced by the UI
 * (that needs hOCR from the OCR pipeline — tracked as a follow-up).
 */
export function annotationsRouter(repos: Repos): Router {
  const router = Router();
  const { annotations } = repos;

  // GET /api/annotations?documentId=N[&page=P] → annotations for a document
  router.get('/', asyncHandler((req, res) => {
    const documentId = Number(req.query['documentId']);
    if (!Number.isFinite(documentId)) throw new ValidationError('documentId is required');

    const pageRaw = req.query['page'];
    if (pageRaw !== undefined) {
      const page = Number(pageRaw);
      if (!Number.isFinite(page)) throw new ValidationError('invalid page');
      ok(res, annotations.findByDocumentAndPage(documentId, page));
      return;
    }

    ok(res, annotations.findByDocument(documentId));
  }));

  // POST /api/annotations → create an annotation
  router.post('/', asyncHandler((req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const documentId = Number(body['documentId']);
    if (!Number.isFinite(documentId)) throw new ValidationError('documentId is required');

    if (!isAnnotationType(body['annotationType'])) {
      throw new ValidationError(`annotationType must be one of: ${ANNOTATION_TYPES.join(', ')}`);
    }

    // Build the input with only the fields actually supplied — exactOptionalPropertyTypes
    // forbids assigning `undefined` to optional properties.
    const input: AnnotationCreateInput = { documentId, annotationType: body['annotationType'] };
    const pageNumber = optionalNumber(body['pageNumber']);
    if (pageNumber !== undefined) input.pageNumber = pageNumber;
    if (body['color']   !== undefined) input.color   = String(body['color']);
    if (body['content'] !== undefined) input.content = String(body['content']);
    const x = optionalNumber(body['x']);      if (x !== undefined) input.x = x;
    const y = optionalNumber(body['y']);      if (y !== undefined) input.y = y;
    const w = optionalNumber(body['width']);  if (w !== undefined) input.width = w;
    const h = optionalNumber(body['height']); if (h !== undefined) input.height = h;
    if (body['createdBy'] !== undefined) input.createdBy = String(body['createdBy']);

    ok(res, annotations.create(input), 201);
  }));

  // PATCH /api/annotations/:id → update content / color / coordinates
  router.patch('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (body['content'] !== undefined) updates['content'] = String(body['content']);
    if (body['color']   !== undefined) updates['color']   = String(body['color']);
    if (body['x']       !== undefined) updates['x']       = optionalNumber(body['x']);
    if (body['y']       !== undefined) updates['y']       = optionalNumber(body['y']);
    if (body['width']   !== undefined) updates['width']   = optionalNumber(body['width']);
    if (body['height']  !== undefined) updates['height']  = optionalNumber(body['height']);

    const updated = annotations.update(id, updates);
    if (!updated) throw new NotFoundError('annotation not found');
    ok(res, updated);
  }));

  // DELETE /api/annotations/:id → remove an annotation
  router.delete('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    if (!annotations.findById(id)) throw new NotFoundError('annotation not found');
    annotations.delete(id);
    ok(res, { ok: true });
  }));

  return router;
}
