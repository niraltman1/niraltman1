import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import {
  approveSchema,
  rejectSchema,
  signSchema,
  listActionPlanQuerySchema,
} from '../validation/action-plan.js';
import { basename } from 'node:path';
import { executeEntries } from '../utils/file-executor.js';

const executeSchema = z.object({ planIds: z.array(z.string().uuid()).min(1) }).strict();

export function actionPlanRouter(repos: Repos): Router {
  const router = Router();
  const { actionPlan } = repos;

  router.get('/', validate(listActionPlanQuerySchema, 'query'), asyncHandler((req, res) => {
    const query = req.query as unknown as z.infer<typeof listActionPlanQuerySchema>;
    const entries = actionPlan.list(query.status, query.limit);
    ok(res, entries);
  }));

  router.post('/approve', validate(approveSchema), asyncHandler((req, res) => {
    const { planIds } = req.body as z.infer<typeof approveSchema>;
    actionPlan.approve(planIds);
    ok(res, { approved: planIds.length });
  }));

  router.post('/reject', validate(rejectSchema), asyncHandler((req, res) => {
    const { planIds } = req.body as z.infer<typeof rejectSchema>;
    actionPlan.reject(planIds);
    ok(res, { rejected: planIds.length });
  }));

  router.post('/sign', validate(signSchema), asyncHandler((req, res) => {
    const { planIds } = req.body as z.infer<typeof signSchema>;
    actionPlan.approve(planIds);
    const signed = actionPlan.getSignedPlan(planIds);

    // Vacuum Protocol: for each signed entry, create a "Review New Document" task
    // so no ingested file goes unreviewed.
    for (const entry of signed.entries) {
      repos.tasks.create({
        title:      `סקור מסמך חדש: ${entry.originalName}`,
        priority:   'high',
        source:     'vacuum_protocol',
        ...(entry.documentId !== null && { documentId: entry.documentId }),
      });
    }

    ok(res, { signedAt: signed.signedAt, totalEntries: signed.totalEntries });
  }));

  // ── Execute: physically move/rename files on disk ──────────────────────────
  router.post('/execute', validate(executeSchema), asyncHandler(async (req, res) => {
    const { planIds } = req.body as z.infer<typeof executeSchema>;

    // Fetch only APPROVED entries from the provided list
    const entries = planIds
      .map((id) => actionPlan.findById(id))
      .filter((e): e is NonNullable<typeof e> => e !== null && e.status === 'APPROVED');

    if (entries.length === 0) {
      ok(res, { executed: 0, failed: 0, results: [] });
      return;
    }

    const results = await executeEntries(entries);

    for (const r of results) {
      if (r.success && r.finalPath) {
        // Update Document record storage path
        const entry = entries.find((e) => e!.planId === r.planId)!;
        if (entry?.documentId) {
          repos.documents.updateStoragePath(
            entry.documentId,
            r.finalPath,
            basename(r.finalPath),
          );
        }
        actionPlan.markExecuted(r.planId, true);
      } else {
        actionPlan.markExecuted(r.planId, false, r.errorMsg ?? undefined);
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed    = results.filter((r) => !r.success).length;

    ok(res, { executed: succeeded, failed, results });
  }));

  return router;
}
