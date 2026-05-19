import { Router } from 'express';
import { z } from 'zod';
import { join } from 'node:path';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
import { EvidenceLocker } from '../modules/evidence/evidence-locker.js';

const LOCKER_ROOT = process.env['EVIDENCE_LOCKER_ROOT']
  ?? join(process.env['LEGAL_OS_ROOT'] ?? process.cwd(), 'Evidence_Locker');

const lockSchema = z.object({
  sourcePath:  z.string().min(1),
  caseId:      z.number().int().positive().nullish(),
  clientId:    z.number().int().positive().nullish(),
  documentId:  z.number().int().positive().nullish(),
  sourceApp:   z.enum(['whatsapp', 'email', 'manual']).optional(),
  mediaType:   z.enum(['voice_note', 'image', 'message', 'attachment', 'file']).optional(),
  notes:       z.string().nullish(),
}).strict();

export function evidenceRouter(repos: Repos): Router {
  const router  = Router();
  const locker  = new EvidenceLocker(repos.evidence, LOCKER_ROOT);

  router.get('/', asyncHandler(async (req, res) => {
    const filters: { caseId?: number; clientId?: number; mediaType?: string } = {};
    if (req.query['caseId'])    filters.caseId    = Number(req.query['caseId']);
    if (req.query['clientId'])  filters.clientId  = Number(req.query['clientId']);
    if (req.query['mediaType']) filters.mediaType = String(req.query['mediaType']);
    ok(res, locker.list(filters));
  }));

  router.post('/lock', validate(lockSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof lockSchema>;
    const result = await locker.lock({
      sourcePath:  body.sourcePath,
      ...(body.caseId     != null ? { caseId:     body.caseId }    : {}),
      ...(body.clientId   != null ? { clientId:   body.clientId }  : {}),
      ...(body.documentId != null ? { documentId: body.documentId }: {}),
      ...(body.sourceApp  != null ? { sourceApp:  body.sourceApp } : {}),
      ...(body.mediaType  != null ? { mediaType:  body.mediaType } : {}),
      ...(body.notes      != null ? { notes:      body.notes }     : {}),
    });
    ok(res, result, result.status === 'locked' ? 201 : 200);
  }));

  router.get('/search', asyncHandler(async (req, res) => {
    const q = String(req.query['q'] ?? '');
    ok(res, q ? locker.search(q) : []);
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const item = locker.findById(id);
    if (!item) throw new NotFoundError(`evidence item ${id}`);
    ok(res, item);
  }));

  router.get('/:id/analysis', asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const item = locker.findById(id);
    if (!item) throw new NotFoundError(`evidence item ${id}`);
    ok(res, { id: item.id, ocrText: item.ocrText });
  }));

  router.post('/:id/analyze', asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const item = locker.findById(id);
    if (!item) throw new NotFoundError(`evidence item ${id}`);
    // Non-blocking: trigger analysis
    void (async () => {
      try {
        const { processAudio, AUDIO_EXTENSIONS } = await import('../utils/audio-pipeline.js');
        const { extname } = await import('node:path');
        if (AUDIO_EXTENSIONS.has(extname(item.lockerPath).toLowerCase())) {
          const result = await processAudio(item.lockerPath, {
            processedFiles: repos.processedFiles,
            documents:      repos.documents,
          });
          if (result.transcript) {
            locker.setAnalysis(id, result.transcript);
          }
        }
      } catch (e) {
        console.warn(`[Evidence] analyze failed for item ${id}:`, e);
      }
    })();
    ok(res, { queued: true });
  }));

  return router;
}
