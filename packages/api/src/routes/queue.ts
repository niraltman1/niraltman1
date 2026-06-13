import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError, ValidationError } from '../errors/api-error.js';
import { discoverFields } from '../utils/field-discovery.js';
import { routeEntities } from '../utils/entity-router.js';

export function queueRouter(repos: Repos): Router {
  const router = Router();
  const { queue, documents, db } = repos;

  router.get('/stats', asyncHandler((_req, res) => {
    ok(res, queue.getStats());
  }));

  router.get('/items', asyncHandler((req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query['limit'] ?? 50)));
    ok(res, queue.listRecent(limit));
  }));

  router.get('/poisoned', asyncHandler((_req, res) => {
    ok(res, queue.getPoisoned());
  }));

  router.post('/requeue/:id', asyncHandler((req, res) => {
    const id = req.params['id']!;
    const success = queue.requeue(id);
    if (!success) throw new NotFoundError('Queue item');
    ok(res, { requeued: true });
  }));

  // ── Review Queue ───────────────────────────────────────────────────────

  router.get('/review-pending', asyncHandler((_req, res) => {
    ok(res, documents.listReviewPending());
  }));

  router.post('/approve/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');
    const doc = documents.findById(id);
    if (!doc) throw new NotFoundError('Document');

    db.prepare(
      "UPDATE Documents SET processing_state = 'complete' WHERE id = ?",
    ).run(id);

    const fields  = discoverFields(doc.ocrText ?? '');
    const insight = documents.findInsights(id) as {
      case_number?: string; court_name?: string; judge_name?: string;
      offense_type?: string; procedure_type?: string; confidence?: number;
    } | null;

    await routeEntities(repos, {
      documentId:       id,
      discoveredFields: fields,
      ragExtraction: {
        caseNumber:    insight?.case_number    ?? null,
        courtName:     insight?.court_name     ?? null,
        judgeName:     insight?.judge_name     ?? null,
        offenseType:   insight?.offense_type   ?? null,
        procedureType: insight?.procedure_type ?? null,
        confidence:    insight?.confidence     ?? 0,
      },
    });

    ok(res, { approved: true });
  }));

  const correctSchema = z.object({
    field_name:      z.string().min(1),
    original_value:  z.string().optional(),
    corrected_value: z.string().min(1),
  }).strict();

  router.post('/correct/:id', validate(correctSchema), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new ValidationError('invalid id');

    const body           = req.body as z.infer<typeof correctSchema>;
    const { field_name, corrected_value } = body;
    const original_value = body.original_value;

    db.prepare(
      'INSERT INTO LearningFeedback (document_id, field_name, original_value, corrected_value) VALUES (?, ?, ?, ?)',
    ).run(id, field_name, original_value ?? null, corrected_value);

    const WRITABLE = new Set([
      'case_number', 'court_name', 'judge_name',
      'offense_type', 'next_hearing', 'document_type',
    ]);
    if (WRITABLE.has(field_name)) {
      db.prepare(
        `UPDATE DocumentInsights SET ${field_name} = ? WHERE document_id = ?`,
      ).run(corrected_value, id);
    }

    ok(res, { recorded: true });
  }));

  // GET /api/pipeline/failures?limit=N — recent OCR/AI pipeline failures (workspace overview)
  router.get('/failures', asyncHandler((req, res) => {
    const limit = Math.min(Number(req.query['limit'] ?? 10), 50);
    const rows = repos.db.prepare(`
      SELECT id, file_name AS file_path, error_message AS error, timestamp AS created_at
        FROM PipelineLogs
       WHERE status IN ('failed_ocr', 'failed_ai')
       ORDER BY timestamp DESC
       LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    ok(res, { failures: rows });
  }));

  return router;
}
