import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
import type { TrafficLifecycleState } from '@legal-os/database';

const VALID_STATES: TrafficLifecycleState[] = [
  'request_to_stand_trial',
  'police_ingestion',
  'summons_issued',
  'closed',
  'statute_lapsed',
];

const createSchema = z.object({
  caseId:              z.number().int().positive(),
  requestDate:         z.string().optional().nullable(),
  ingestionDate:       z.string().optional().nullable(),
  policeFileNumber:    z.string().optional().nullable(),
  prosecutionEntity:   z.string().optional().nullable(),
  offenseDescription:  z.string().optional().nullable(),
  notes:               z.string().optional().nullable(),
}).strict();

const transitionSchema = z.object({
  state: z.enum(['request_to_stand_trial','police_ingestion','summons_issued','closed','statute_lapsed']),
  date:  z.string().optional().nullable(),
}).strict();

const updateMetaSchema = z.object({
  policeFileNumber:      z.string().optional().nullable(),
  prosecutionEntity:     z.string().optional().nullable(),
  offenseDescription:    z.string().optional().nullable(),
  notes:                 z.string().optional().nullable(),
  drivingLicenseNumber:  z.string().optional().nullable(),
  identityNodeType:      z.enum(['id_number','driving_license','passport']).optional(),
}).strict();

const rejectionSchema = z.object({
  keywords:   z.array(z.string()).min(1),
  excerpt:    z.string(),
  documentId: z.number().int().positive().optional().nullable(),
}).strict();

export function trafficRouter(repos: Repos): Router {
  const router = Router();
  const { trafficCases } = repos;

  // ── Create traffic case record ─────────────────────────────────────────────
  router.post('/', validate(createSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof createSchema>;

    // Validate the referenced case exists
    const theCase = repos.cases.findById(body.caseId);
    if (!theCase) throw new NotFoundError('Case');

    // Upsert: if already exists, return existing
    const existing = trafficCases.findByCaseId(body.caseId);
    if (existing) {
      ok(res, existing);
      return;
    }

    const created = trafficCases.create({
      caseId:             body.caseId,
      requestDate:        body.requestDate        ?? null,
      ingestionDate:      body.ingestionDate      ?? null,
      policeFileNumber:   body.policeFileNumber   ?? null,
      prosecutionEntity:  body.prosecutionEntity  ?? null,
      offenseDescription: body.offenseDescription ?? null,
      notes:              body.notes              ?? null,
    });
    ok(res, created, 201);
  }));

  // ── Get by case ID ────────────────────────────────────────────────────────
  router.get('/by-case/:caseId', asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    const tc     = trafficCases.findByCaseId(caseId);
    if (!tc) {
      ok(res, null);
      return;
    }

    // Enrich with days remaining
    const days = tc.statuteDeadline
      ? Math.floor((new Date(tc.statuteDeadline).getTime() - Date.now()) / 86_400_000)
      : null;

    ok(res, { ...tc, daysRemaining: days });
  }));

  // ── Advance state machine ─────────────────────────────────────────────────
  router.patch('/:caseId/state', validate(transitionSchema), asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    const body   = req.body as z.infer<typeof transitionSchema>;
    const updated = trafficCases.transitionState(caseId, body.state, body.date ?? null);
    if (!updated) throw new NotFoundError('TrafficCase');
    ok(res, updated);
  }));

  // ── Record rejection ──────────────────────────────────────────────────────
  router.post('/:caseId/rejection', validate(rejectionSchema), asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    const body   = req.body as z.infer<typeof rejectionSchema>;

    const tc = trafficCases.findByCaseId(caseId);
    if (!tc) throw new NotFoundError('TrafficCase');

    trafficCases.markRejection(caseId, body.keywords, body.excerpt, body.documentId ?? null);
    ok(res, { caseId, rejectionRecorded: true });
  }));

  // ── Clear rejection ───────────────────────────────────────────────────────
  router.delete('/:caseId/rejection', asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    trafficCases.clearRejection(caseId);
    ok(res, { caseId, rejectionCleared: true });
  }));

  // ── Update metadata ───────────────────────────────────────────────────────
  router.patch('/:caseId/metadata', validate(updateMetaSchema), asyncHandler((req, res) => {
    const caseId = Number(req.params['caseId']);
    const body   = req.body as z.infer<typeof updateMetaSchema>;

    const tc = trafficCases.findByCaseId(caseId);
    if (!tc) throw new NotFoundError('TrafficCase');

    trafficCases.updateMetadata(caseId, {
      policeFileNumber:   body.policeFileNumber   ?? null,
      prosecutionEntity:  body.prosecutionEntity  ?? null,
      offenseDescription: body.offenseDescription ?? null,
      notes:              body.notes              ?? null,
    });

    // Update driving license fields directly (added in migration 034)
    if (body.drivingLicenseNumber !== undefined || body.identityNodeType !== undefined) {
      const parts: string[] = [];
      const params: Record<string, unknown> = { caseId };
      if (body.drivingLicenseNumber !== undefined) {
        parts.push('driving_license_number = @dlNum');
        params['dlNum'] = body.drivingLicenseNumber;
      }
      if (body.identityNodeType !== undefined) {
        parts.push('identity_node_type = @nodeType');
        params['nodeType'] = body.identityNodeType;
      }
      if (parts.length > 0) {
        repos.db.prepare(
          `UPDATE TrafficCases SET ${parts.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE case_id = @caseId`,
        ).run(params);
      }
    }

    ok(res, trafficCases.findByCaseId(caseId));
  }));

  // ── Get active alerts (near-deadline + rejections) ────────────────────────
  router.get('/alerts', asyncHandler((req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query['days'] ?? 90)));
    // Auto-lapse any expired cases before returning alerts
    trafficCases.checkAndLapseExpired();
    ok(res, trafficCases.getAlerts(days));
  }));

  return router;
}
