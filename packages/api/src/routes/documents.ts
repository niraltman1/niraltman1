import { Router } from 'express';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { NotFoundError, ValidationError } from '../errors/api-error.js';
import { emitActivity } from '../utils/activity-emitter.js';
import { logAuditEvent } from '../middleware/audit-logger.js';
import { mimeFromExtension } from '../utils/file-hash.js';

export function documentsRouter(repos: Repos): Router {
  const router = Router();
  const { documents, db } = repos;

  router.get('/', asyncHandler((req, res) => {
    const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
    const result = documents.list({ page, pageSize });
    ok(res, result);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const doc = documents.findById(id);
    if (!doc) throw new NotFoundError('Document');
    ok(res, doc);
  }));

  router.get('/:id/status', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const doc = documents.findById(id);
    if (!doc) throw new NotFoundError('Document');
    const history = db
      .prepare('SELECT * FROM ProcessingStatus WHERE document_id = ? ORDER BY created_at ASC')
      .all(id) as Record<string, unknown>[];
    ok(res, history);
  }));

  // Serve the raw document file for the in-app reader (§4.1.2). Local file only.
  router.get('/:id/file', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const doc = documents.findById(id);
    if (!doc) throw new NotFoundError('Document');
    const storagePath = doc.storagePath;
    if (!storagePath || !existsSync(storagePath)) throw new NotFoundError('File');

    const ext  = extname(storagePath);
    const mime = doc.mimeType ?? mimeFromExtension(ext) ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
    );
    res.sendFile(resolve(storagePath));
  }));

  router.get('/:id/insights', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const doc = documents.findById(id);
    if (!doc) throw new NotFoundError('Document');
    const insights = documents.findInsights(id);
    ok(res, insights ?? {});
  }));

  // Verify (approve/reject) an insight
  router.post('/insights/:id/verify', asyncHandler((req, res) => {
    const insightId = Number(req.params['id']);
    if (!Number.isFinite(insightId)) throw new ValidationError('invalid id');

    const { state } = req.body as { state?: string };
    if (state !== 'approved' && state !== 'rejected') {
      throw new ValidationError("state must be 'approved' or 'rejected'");
    }

    const insight = db.prepare(
      'SELECT id, document_id FROM DocumentInsights WHERE id = ?',
    ).get(insightId) as { id: number; document_id: number } | undefined;
    if (!insight) throw new NotFoundError('Insight');

    db.prepare(
      'UPDATE DocumentInsights SET verification_state = ? WHERE id = ?',
    ).run(state, insightId);

    const actorId = (req as unknown as { userId?: number }).userId;
    logAuditEvent(db, {
      eventType:    'update',
      ...(actorId !== undefined ? { actorId } : {}),
      resourceType: 'document_insight',
      resourceId:   String(insightId),
      actionDetail: { state, documentId: insight.document_id },
      severity:     'info',
    });
    emitActivity(repos, {
      kind:       'verification_completed',
      documentId: insight.document_id,
      message:    `Insight ${state}`,
      details:    { insightId, state },
    });

    ok(res, { id: insightId, verification_state: state });
  }));

  // Inline-edit the human-editable extracted fields of an insight (§4.2.1).
  router.patch('/insights/:id', asyncHandler((req, res) => {
    const insightId = Number(req.params['id']);
    if (!Number.isFinite(insightId)) throw new ValidationError('invalid id');

    const insight = documents.findInsightById(insightId);
    if (!insight) throw new NotFoundError('Insight');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const EDITABLE = ['caseNumber', 'courtName', 'judgeName', 'offenseType', 'nextHearing'] as const;
    const fields: Record<string, string | null> = {};
    for (const key of EDITABLE) {
      if (body[key] === undefined) continue;
      const v = body[key];
      if (v !== null && typeof v !== 'string') {
        throw new ValidationError(`${key} must be a string or null`);
      }
      if (typeof v === 'string' && v.length > 500) {
        throw new ValidationError(`${key} exceeds 500 characters`);
      }
      fields[key] = v as string | null;
    }
    if (Object.keys(fields).length === 0) {
      throw new ValidationError('no editable fields provided');
    }

    documents.updateInsightFields(insightId, fields);

    const actorId = (req as unknown as { userId?: number }).userId;
    logAuditEvent(db, {
      eventType:    'update',
      ...(actorId !== undefined ? { actorId } : {}),
      resourceType: 'document_insight',
      resourceId:   String(insightId),
      actionDetail: { edited: Object.keys(fields), documentId: insight['document_id'] },
      severity:     'info',
    });
    emitActivity(repos, {
      kind:       'verification_completed',
      documentId: insight['document_id'] as number,
      message:    'Insight fields edited',
      details:    { insightId, edited: Object.keys(fields) },
    });

    ok(res, documents.findInsightById(insightId) ?? {});
  }));

  return router;
}
