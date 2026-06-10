import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../utils/response.js';
import { NotFoundError } from '../errors/api-error.js';
import { requireRole } from '../middleware/auth.js';
import { logAuditEvent } from '../middleware/audit-logger.js';

const erasureRequestSchema = z.object({
  requesterName: z.string().min(1),
  resourceType:  z.string().min(1),
  resourceId:    z.number(),
  reason:        z.string().optional(),
}).strict();

const erasureRejectSchema = z.object({
  reason: z.string().optional(),
}).strict();

export function erasureRouter(repos: Repos): Router {
  const router = Router();

  // Submit an erasure request (any authenticated user can request)
  router.post('/request', validate(erasureRequestSchema), asyncHandler((req, res) => {
    const { requesterName, resourceType, resourceId, reason } =
      req.body as z.infer<typeof erasureRequestSchema>;

    const result = repos.db.prepare(`
      INSERT INTO erasure_requests (requester_name, resource_type, resource_id, reason)
      VALUES (?, ?, ?, ?)
    `).run(requesterName, resourceType, resourceId, reason ?? null);

    logAuditEvent(repos.db, {
      eventType: 'erasure', resourceType, resourceId: String(resourceId),
      actionDetail: { phase: 'requested', requesterName }, severity: 'critical',
    });

    ok(res, { id: result.lastInsertRowid, status: 'pending' }, 201);
  }));

  // List erasure requests (admin only)
  router.get('/', requireRole('admin', repos), asyncHandler((_req, res) => {
    const requests = repos.db.prepare(
      'SELECT * FROM erasure_requests ORDER BY created_at DESC',
    ).all();
    ok(res, requests);
  }));

  // Execute an erasure (admin only)
  router.post('/:id/execute', requireRole('admin', repos), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!Number.isFinite(id)) throw new NotFoundError('erasure request');

    const request = repos.db.prepare(
      'SELECT * FROM erasure_requests WHERE id = ?',
    ).get(id) as {
      id: number; resource_type: string; resource_id: number;
      status: string; legal_hold: number;
    } | undefined;

    if (!request) throw new NotFoundError('erasure request');
    if (request.status === 'completed') {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Already completed' } });
      return;
    }
    if (request.legal_hold) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Legal hold active — erasure blocked' } });
      return;
    }

    repos.db.prepare("UPDATE erasure_requests SET status = 'processing' WHERE id = ?").run(id);

    const actorId = (req as unknown as { userId?: number }).userId;
    executeErasure(repos, request.resource_type, request.resource_id, actorId);

    repos.db.prepare(`
      UPDATE erasure_requests
      SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), completed_by = ?
      WHERE id = ?
    `).run(actorId ?? null, id);

    logAuditEvent(repos.db, {
      eventType: 'erasure',
      ...(actorId !== undefined ? { actorId } : {}),
      resourceType: request.resource_type,
      resourceId: String(request.resource_id),
      actionDetail: { phase: 'completed', erasureRequestId: id }, severity: 'critical',
    });

    ok(res, { message: 'Erasure completed', resourceType: request.resource_type, resourceId: request.resource_id });
  }));

  // Reject an erasure request (admin only)
  router.post('/:id/reject', requireRole('admin', repos), validate(erasureRejectSchema), asyncHandler((req, res) => {
    const id     = Number(req.params['id']);
    const reason = (req.body as z.infer<typeof erasureRejectSchema>).reason ?? 'No reason provided';
    if (!Number.isFinite(id)) throw new NotFoundError('erasure request');

    const request = repos.db.prepare('SELECT id FROM erasure_requests WHERE id = ?').get(id);
    if (!request) throw new NotFoundError('erasure request');

    repos.db.prepare(`
      UPDATE erasure_requests SET status = 'rejected', rejection_reason = ? WHERE id = ?
    `).run(reason, id);

    ok(res, { message: 'Erasure request rejected' });
  }));

  return router;
}

function executeErasure(repos: Repos, resourceType: string, resourceId: number, actorId?: number): void {
  if (resourceType === 'client') {
    eraseClient(repos, resourceId);
  } else if (resourceType === 'document') {
    eraseDocument(repos, resourceId);
  } else if (resourceType === 'contact') {
    eraseContact(repos, resourceId);
  }
  // Log the erasure
  logAuditEvent(repos.db, {
    eventType: 'delete',
    ...(actorId !== undefined ? { actorId } : {}),
    resourceType,
    resourceId: String(resourceId),
    actionDetail: { erasedFields: getPiiFields(resourceType) }, severity: 'critical',
  });
}

function getPiiFields(resourceType: string): string[] {
  const map: Record<string, string[]> = {
    client:   ['id_number', 'phone', 'email', 'name_he', 'name_en', 'address_he'],
    document: ['ocr_text'],
    contact:  ['name_he', 'name_en', 'phone', 'email'],
  };
  return map[resourceType] ?? [];
}

function eraseClient(repos: Repos, clientId: number): void {
  // Zero-out PII fields
  repos.db.prepare(`
    UPDATE Clients SET
      id_number = '[ERASED]', phone = '[ERASED]', email = '[ERASED]',
      name_he = '[ERASED]', name_en = NULL,
      address_he = NULL, notes = NULL,
      id_number_encrypted = 0, phone_encrypted = 0,
      is_active = 0
    WHERE id = ?
  `).run(clientId);

  // Clear encrypted field entries
  repos.db.prepare(
    "DELETE FROM encrypted_fields WHERE table_name = 'Clients' AND row_id = ?",
  ).run(clientId);

  // Null out OCR text on linked documents
  repos.db.prepare(`
    UPDATE Documents SET ocr_text = NULL
    WHERE case_id IN (SELECT id FROM Cases WHERE client_id = ?)
  `).run(clientId);
}

function eraseDocument(repos: Repos, documentId: number): void {
  repos.db.prepare('UPDATE Documents SET ocr_text = NULL WHERE id = ?').run(documentId);
  repos.db.prepare(
    "DELETE FROM encrypted_fields WHERE table_name = 'Documents' AND row_id = ?",
  ).run(documentId);
}

function eraseContact(repos: Repos, contactId: number): void {
  repos.db.prepare(`
    UPDATE Contacts SET
      name_he = '[ERASED]', name_en = NULL,
      phone = NULL, email = NULL
    WHERE id = ?
  `).run(contactId);
}
