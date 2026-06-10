import { Router } from 'express';
import { z } from 'zod';
import { resolve } from 'node:path';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { ValidationError, NotFoundError } from '../errors/api-error.js';
import { ingestTabularFile } from '../utils/tabular-engine.js';

const ingestSchema = z.object({
  filePath:    z.string().optional(),
  ceilPercent: z.number().optional(),
}).strict();

export function tabularRouter(repos: Repos): Router {
  const router = Router();
  const { documents, processedFiles } = repos;

  // POST /api/tabular/ingest — parse a CSV or Excel file
  router.post('/ingest', validate(ingestSchema), asyncHandler(async (req, res) => {
    const { filePath: rawFilePath, ceilPercent } = req.body as z.infer<typeof ingestSchema>;
    if (!rawFilePath?.trim()) throw new ValidationError('filePath שדה חובה');
    const filePath = resolve(rawFilePath.trim()); // normalize before any fs operation (CWE-22)

    const result = await ingestTabularFile({
      filePath,
      documents,
      processedFiles,
      ceilPercent: ceilPercent ?? 70,
    }).catch((e) => {
      if ((e as { code?: string }).code === 'ENOENT') throw new NotFoundError(`קובץ לא נמצא: ${filePath}`);
      throw e;
    });

    ok(res, {
      fileHash:     result.fileHash,
      rowCount:     result.rowCount,
      sheetCount:   result.sheetCount,
      caseScales:   result.caseScales,
      linkedDocIds: result.linkedDocIds,
      errors:       result.errors,
      effortReport: result.effortReport,
      // Return first 200 rows only (rest in full export)
      rows: result.rows.slice(0, 200),
    });
  }));

  // GET /api/tabular/case-scales — return case scales from last ingest (stored in DocumentInsights)
  router.get('/case-scales', asyncHandler((_req, res) => {
    const rows = repos.db.prepare(`
      SELECT
        di.case_number,
        COUNT(*) AS doc_count,
        MAX(d.created_at) AS last_seen,
        GROUP_CONCAT(d.extension, ',') AS extensions
      FROM DocumentInsights di
      JOIN Documents d ON d.id = di.document_id
      WHERE di.case_number IS NOT NULL
      GROUP BY di.case_number
      ORDER BY doc_count DESC
      LIMIT 200
    `).all() as { case_number: string; doc_count: number; last_seen: string; extensions: string }[];

    const scales = rows.map((r) => ({
      caseNumber:  r.case_number,
      docCount:    r.doc_count,
      lastSeen:    r.last_seen,
      extensions:  [...new Set((r.extensions ?? '').split(','))],
    }));

    ok(res, scales);
  }));

  return router;
}
