/**
 * /api/data-migration — Database Intelligence Platform routes.
 *
 * PREVIEW ONLY — These endpoints scan and analyze external data sources.
 * No import execution happens in Phase 3. All operations are read-only.
 *
 * POST /api/data-migration/scan               — Scan a source (sqlite/csv/excel)
 * POST /api/data-migration/analyze            — Semantic schema analysis
 * POST /api/data-migration/report             — Full mapping recommendation report
 * POST /api/data-migration/plan               — Generate migration execution plan (no execution)
 * POST /api/data-migration/document-inventory — Analyze document folder
 * POST /api/data-migration/file-structure     — Analyze folder hierarchy
 */

import { Router } from 'express';
import { z }      from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { ok }           from '../utils/response.js';
import { validate }     from '../middleware/validate.js';
import {
  DatabaseScanner,
  SemanticSchemaAnalyzer,
  MappingRecommendationEngine,
  ImportPlanner,
  DocumentInventoryAnalyzer,
  FileStructureAnalyzer,
} from '@factum-il/database-intelligence';

// ── Input schemas ──────────────────────────────────────────────────────────────

const scanSchema = z.object({
  path: z.string().min(1),
  type: z.enum(['sqlite', 'csv', 'excel']).optional(),
});

const pathSchema = z.object({
  path: z.string().min(1),
});

// ── Router factory ─────────────────────────────────────────────────────────────

export function dataMigrationRouter(): Router {
  const router = Router();

  // ── POST /scan ────────────────────────────────────────────────────────────
  router.post('/scan', validate(scanSchema), asyncHandler(async (req, res) => {
    const { path, type } = req.body as z.infer<typeof scanSchema>;
    const scanner = type
      ? new DatabaseScanner({ type, path })
      : DatabaseScanner.autoDetect(path);

    const connection = await scanner.testConnection();
    if (!connection.success) {
      res.status(400).json({ success: false, error: { message: connection.detail } });
      return;
    }

    const snapshot = await scanner.scan();
    ok(res, { snapshot });
  }));

  // ── POST /analyze ─────────────────────────────────────────────────────────
  router.post('/analyze', validate(scanSchema), asyncHandler(async (req, res) => {
    const { path, type } = req.body as z.infer<typeof scanSchema>;
    const scanner = type
      ? new DatabaseScanner({ type, path })
      : DatabaseScanner.autoDetect(path);

    const snapshot = await scanner.scan();
    const analysis = new SemanticSchemaAnalyzer().analyze(snapshot);
    ok(res, { analysis });
  }));

  // ── POST /report ──────────────────────────────────────────────────────────
  router.post('/report', validate(scanSchema), asyncHandler(async (req, res) => {
    const { path, type } = req.body as z.infer<typeof scanSchema>;
    const scanner = type
      ? new DatabaseScanner({ type, path })
      : DatabaseScanner.autoDetect(path);

    const snapshot = await scanner.scan();
    const analysis = new SemanticSchemaAnalyzer().analyze(snapshot);
    const report   = new MappingRecommendationEngine().generateReport(analysis);
    ok(res, { report });
  }));

  // ── POST /plan ────────────────────────────────────────────────────────────
  router.post('/plan', validate(scanSchema), asyncHandler(async (req, res) => {
    const { path, type } = req.body as z.infer<typeof scanSchema>;
    const scanner = type
      ? new DatabaseScanner({ type, path })
      : DatabaseScanner.autoDetect(path);

    const snapshot = await scanner.scan();
    const analysis = new SemanticSchemaAnalyzer().analyze(snapshot);
    const report   = new MappingRecommendationEngine().generateReport(analysis);
    const plan     = new ImportPlanner().plan(report);
    ok(res, { plan });
  }));

  // ── POST /document-inventory ──────────────────────────────────────────────
  router.post('/document-inventory', validate(pathSchema), asyncHandler(async (req, res) => {
    const { path } = req.body as z.infer<typeof pathSchema>;
    const report   = new DocumentInventoryAnalyzer().analyze(path);
    ok(res, { report });
  }));

  // ── POST /file-structure ──────────────────────────────────────────────────
  router.post('/file-structure', validate(pathSchema), asyncHandler(async (req, res) => {
    const { path } = req.body as z.infer<typeof pathSchema>;
    const report   = new FileStructureAnalyzer().analyze(path);
    ok(res, { report });
  }));

  return router;
}
