import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { MediaPipeline } from '../utils/media-pipeline.js';
import { isTesseractAvailable, isImageMagickAvailable } from '../utils/image-to-pdf.js';
import { parsePagination } from '../utils/pagination.js';
import { routeEntities } from '../utils/entity-router.js';

const ingestSchema = z.object({
  filePath:   z.string().min(1),
  clientId:   z.number().int().positive().optional().nullable(),
  caseId:     z.number().int().positive().optional().nullable(),
  clientName: z.string().optional(),
  outputDir:  z.string().optional(),
}).strict();

const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  status:   z.string().optional(),
}).strict();

export function mediaRouter(repos: Repos): Router {
  const router = Router();
  const pipeline = new MediaPipeline(repos.processedFiles, repos.documents, repos.evidence, repos.clients, repos.cases, repos.pipelineLogs, repos.contacts);

  // ── Health check — verify tools available ──────────────────────────────
  router.get('/health', asyncHandler(async (_req, res) => {
    const [tesseract, imageMagick] = await Promise.all([
      isTesseractAvailable(),
      isImageMagickAvailable(),
    ]);
    ok(res, {
      tesseract,
      imageMagick,
      ready: tesseract,
      heicSupport: imageMagick,
    });
  }));

  // ── Registry list ──────────────────────────────────────────────────────
  router.get('/registry', validate(listQuerySchema, 'query'), asyncHandler((req, res) => {
    const q    = req.query as { page?: number; pageSize?: number; status?: string };
    const opts: { page?: number; pageSize?: number; status?: string } = {};
    if (q.page     !== undefined) opts.page     = q.page;
    if (q.pageSize !== undefined) opts.pageSize = q.pageSize;
    if (q.status   !== undefined) opts.status   = q.status;
    const result = repos.processedFiles.list(opts);
    ok(res, result);
  }));

  // ── Registry stats ─────────────────────────────────────────────────────
  router.get('/registry/stats', asyncHandler((_req, res) => {
    ok(res, repos.processedFiles.stats());
  }));

  // ── Get single entry by hash ───────────────────────────────────────────
  router.get('/registry/:hash', asyncHandler((req, res) => {
    const hash = req.params['hash']!;
    const entry = repos.processedFiles.findByHash(hash);
    if (!entry) throw new NotFoundError('ProcessedFile');
    ok(res, entry);
  }));

  // ── Scan summary — recent pipeline events with status breakdown ───────
  router.get('/scan-summary', asyncHandler((_req, res) => {
    const withinMinutes = Number(_req.query['minutes'] ?? 60);
    const summary = repos.pipelineLogs.summary(withinMinutes);
    ok(res, summary);
  }));

  // ── Ingest a file (hash → dedup check → convert if image → register) ──
  router.post('/ingest', validate(ingestSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ingestSchema>;
    const ingestOpts: Parameters<typeof pipeline.ingest>[0] = { filePath: body.filePath, clientId: body.clientId ?? null };
    if (body.caseId     !== undefined) ingestOpts.caseId     = body.caseId;
    if (body.clientName !== undefined) ingestOpts.clientName = body.clientName;
    if (body.outputDir  !== undefined) ingestOpts.outputDir  = body.outputDir;
    const result = await pipeline.ingest(ingestOpts);

    if (result.status !== 'failed' && result.status !== 'excluded' && result.documentId && result.discoveredFields) {
      void routeEntities(repos, {
        documentId:       result.documentId,
        discoveredFields: result.discoveredFields,
        ragExtraction:    { caseNumber: result.discoveredFields.caseNumbers[0] ?? null },
      }).catch(() => {});
    }

    const statusCode = result.status === 'failed' ? 422 : 200;
    ok(res, result, statusCode);
  }));

  return router;
}
