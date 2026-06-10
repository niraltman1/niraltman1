import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';
import { parseRegulationIntoMilestones } from '../utils/regulation-parser.js';
import {
  learnSchema,
  saveTemplateSchema,
  applyTemplateSchema,
  updateProcedureSchema,
  listTemplatesQuerySchema,
} from '../validation/legal-engine.js';

export function legalEngineRouter(repos: Repos): Router {
  const router = Router();
  const { legalEngine, tasks, cases } = repos;

  // ─── Check if a case type has a template (called on case creation) ─────────
  router.get('/templates', validate(listTemplatesQuerySchema, 'query'), asyncHandler((req, res) => {
    const q = req.query as z.infer<typeof listTemplatesQuerySchema>;
    const templates = legalEngine.listTemplates(q.status);
    ok(res, templates);
  }));

  router.get('/templates/:id', asyncHandler((req, res) => {
    const id  = Number(req.params['id']);
    const tpl = legalEngine.findTemplateById(id);
    if (!tpl) throw new NotFoundError('Template');
    const milestones = legalEngine.getMilestones(id);
    ok(res, { ...tpl, milestones });
  }));

  // Check if a template exists for a given case type
  router.get('/templates/by-case-type/:caseType', asyncHandler((req, res) => {
    const caseType = req.params['caseType']!;
    const tpl      = legalEngine.findTemplateByCaseType(caseType);
    if (!tpl) {
      ok(res, { exists: false, template: null });
      return;
    }
    const milestones = legalEngine.getMilestones(tpl.id);
    ok(res, { exists: true, template: { ...tpl, milestones } });
  }));

  // ─── Learning Mode: Ollama parsing ─────────────────────────────────────────
  // Returns a draft skeleton — does NOT persist anything yet.
  router.post('/learn', validate(learnSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof learnSchema>;
    const skeleton = await parseRegulationIntoMilestones(
      body.caseType,
      body.legalBasis,
      body.sourceText,
    );
    ok(res, skeleton);
  }));

  // ─── Save approved template + milestones ───────────────────────────────────
  router.post('/templates', validate(saveTemplateSchema), asyncHandler((req, res) => {
    const body = req.body as z.infer<typeof saveTemplateSchema>;

    const tpl = legalEngine.createTemplate({
      caseType:    body.caseType,
      nameHe:      body.nameHe,
      aiGenerated: body.aiGenerated ?? false,
      status:      'draft',
      ...(body.nameEn      !== undefined && { nameEn:     body.nameEn }),
      ...(body.legalBasis  !== undefined && { legalBasis: body.legalBasis }),
      ...(body.sourceUrl   !== undefined && { sourceUrl:  body.sourceUrl }),
      ...(body.sourceText  !== undefined && { sourceText: body.sourceText }),
    });

    const milestones = legalEngine.replaceMilestones(tpl.id, body.milestones);
    const approved   = legalEngine.approveTemplate(tpl.id);
    ok(res, { ...approved, milestones }, 201);
  }));

  router.post('/templates/:id/approve', asyncHandler((req, res) => {
    const id  = Number(req.params['id']);
    const tpl = legalEngine.approveTemplate(id);
    if (!tpl) throw new NotFoundError('Template');
    ok(res, tpl);
  }));

  router.post('/templates/:id/deprecate', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    if (!legalEngine.findTemplateById(id)) throw new NotFoundError('Template');
    legalEngine.deprecateTemplate(id);
    ok(res, { deprecated: id });
  }));

  // ─── Apply template to a case (creates Tasks for each milestone) ───────────
  router.post('/cases/:caseId/apply-template', validate(applyTemplateSchema), asyncHandler((req, res) => {
    const caseId   = Number(req.params['caseId']);
    const body     = req.body as z.infer<typeof applyTemplateSchema>;
    const theCase  = cases.findById(caseId);
    if (!theCase) throw new NotFoundError('Case');

    const tpl = legalEngine.findTemplateById(body.templateId);
    if (!tpl) throw new NotFoundError('Template');

    const milestones = legalEngine.getMilestones(body.templateId);
    const anchor     = new Date(body.anchorDate);
    let   prevDue    = anchor;

    // Create one Task per milestone
    for (const m of milestones) {
      let dueDate: string | null = null;

      if (m.dayOffset !== null) {
        const base = m.anchor === 'previous' ? prevDue : anchor;
        const due  = new Date(base);
        due.setDate(due.getDate() + m.dayOffset);
        dueDate = due.toISOString();
        prevDue = due;
      }

      const task = tasks.create({
        title:    m.titleHe,
        priority: m.taskPriority,
        status:   'pending',
        caseId,
        clientId: theCase.clientId,
        source:   'action_plan',
        ...(m.description !== null && m.description !== undefined ? { description: m.description } : {}),
        ...(dueDate !== null ? { dueDate } : {}),
      });

      void task; // used for side effect
    }

    const procedure = legalEngine.applyTemplate(caseId, body.templateId, body.anchorDate);
    const createdTasks = tasks.list({ caseId, limit: 100 });
    ok(res, { procedure, tasksCreated: createdTasks.total });
  }));

  // ─── Get / update a case's procedure ──────────────────────────────────────
  router.get('/cases/:caseId/procedure', asyncHandler((req, res) => {
    const caseId    = Number(req.params['caseId']);
    const procedure = legalEngine.getProcedure(caseId);
    ok(res, procedure);
  }));

  router.patch('/cases/:caseId/procedure', validate(updateProcedureSchema), asyncHandler((req, res) => {
    const caseId  = Number(req.params['caseId']);
    const updated = legalEngine.updateProcedure(caseId, req.body as Parameters<typeof legalEngine.updateProcedure>[1]);
    if (!updated) throw new NotFoundError('CaseProcedure');
    ok(res, updated);
  }));

  return router;
}
