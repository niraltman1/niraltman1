import { Router } from 'express';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { NotFoundError } from '../errors/api-error.js';

const OLLAMA_URL   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';

async function ollamaFillForm(
  formSchema: string,
  context:    Record<string, unknown>,
): Promise<{ fieldValues: Record<string, string>; confidence: number }> {
  const fields = JSON.parse(formSchema) as Array<{ name: string; labelHe: string; aiHint?: string }>;
  const fieldList = fields.map((f) => `${f.name} (${f.labelHe}${f.aiHint ? ` — מידע: ${context[f.aiHint] ?? ''}` : ''})`).join('\n');

  const prompt = `אתה מסייע למלא טפסים משפטיים בישראל.
בהינתן הפרטים הבאים, מלא את השדות המבוקשים. השב ב-JSON בלבד ללא הסברים.

הקשר התיק:
${JSON.stringify(context, null, 2)}

שדות למילוי:
${fieldList}

פורמט הפלט:
{ "fieldName": "ערך", ... }`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.1 } }),
      signal:  AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { fieldValues: {}, confidence: 0 };
    const data     = await res.json() as { response?: string };
    const raw      = (data.response ?? '').trim();
    const jsonStr  = raw.startsWith('```') ? raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim() : raw;
    const parsed   = JSON.parse(jsonStr) as Record<string, string>;
    return { fieldValues: parsed, confidence: 0.8 };
  } catch {
    return { fieldValues: {}, confidence: 0 };
  }
}

const createTemplateSchema = z.object({
  nameHe:       z.string().min(1),
  nameEn:       z.string().nullish(),
  category:     z.enum(['civil','criminal','family','labour','administrative','traffic','general']).optional(),
  formSchema:   z.string().min(2),
  instructions: z.string().nullish(),
  legalBasis:   z.string().nullish(),
  version:      z.string().optional(),
}).strict();

const fillSchema = z.object({
  caseId:   z.number().int().positive().nullish(),
  clientId: z.number().int().positive().nullish(),
  context:  z.record(z.unknown()).optional(),
}).strict();

const saveSubmissionSchema = z.object({
  templateId:   z.number().int().positive(),
  caseId:       z.number().int().positive().nullish(),
  clientId:     z.number().int().positive().nullish(),
  fieldValues:  z.record(z.unknown()),
  aiFilled:     z.boolean().optional(),
  aiConfidence: z.number().min(0).max(1).nullish(),
}).strict();

const updateSubmissionSchema = z.object({
  fieldValues: z.record(z.unknown()),
  status:      z.enum(['draft', 'completed', 'submitted']).optional(),
}).strict();

const contentUpdateSchema = z.object({
  version:        z.string(),
  stensTemplates: z.array(z.object({
    nameHe:      z.string(),
    category:    z.string(),
    formSchema:  z.string(),
    version:     z.string(),
    contentHash: z.string(),
  })),
  bundleHash: z.string(),
}).strict();

export function stensRouter(repos: Repos): Router {
  const router = Router();

  router.get('/templates', asyncHandler(async (req, res) => {
    const category = req.query['category'] ? String(req.query['category']) : undefined;
    ok(res, repos.stens.listTemplates(category));
  }));

  router.get('/templates/:id', asyncHandler(async (req, res) => {
    const id  = Number(req.params['id']);
    const tmpl = repos.stens.findTemplateById(id);
    if (!tmpl) throw new NotFoundError(`template ${id}`);
    ok(res, tmpl);
  }));

  router.post('/templates', validate(createTemplateSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createTemplateSchema>;
    const tmpl = repos.stens.createTemplate({
      nameHe:       body.nameHe,
      formSchema:   body.formSchema,
      ...(body.nameEn       != null ? { nameEn:       body.nameEn }       : {}),
      ...(body.category     != null ? { category:     body.category }     : {}),
      ...(body.instructions != null ? { instructions: body.instructions } : {}),
      ...(body.legalBasis   != null ? { legalBasis:   body.legalBasis }   : {}),
      ...(body.version      != null ? { version:      body.version }      : {}),
    });
    ok(res, tmpl, 201);
  }));

  router.post('/templates/:id/fill', validate(fillSchema), asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const body = req.body as z.infer<typeof fillSchema>;
    const tmpl = repos.stens.findTemplateById(id);
    if (!tmpl) throw new NotFoundError(`template ${id}`);

    const context: Record<string, unknown> = { ...(body.context ?? {}) };

    if (body.caseId) {
      const caseRow = repos.db.prepare(
        `SELECT case_number, title_he, court_name, judge_name FROM Cases WHERE id = ?`,
      ).get(body.caseId) as Record<string, unknown> | undefined;
      if (caseRow) Object.assign(context, caseRow);
    }
    if (body.clientId) {
      const client = repos.db.prepare(
        `SELECT name_he, id_number FROM Clients WHERE id = ?`,
      ).get(body.clientId) as Record<string, unknown> | undefined;
      if (client) Object.assign(context, client);
    }

    const { fieldValues, confidence } = await ollamaFillForm(tmpl.formSchema, context);

    const submission = repos.stens.createSubmission({
      templateId:   id,
      ...(body.caseId   != null ? { caseId:   body.caseId }   : {}),
      ...(body.clientId != null ? { clientId: body.clientId } : {}),
      fieldValues:  JSON.stringify(fieldValues),
      aiFilled:     true,
      aiConfidence: confidence,
    });

    ok(res, { submission, fieldValues, confidence }, 201);
  }));

  router.post('/submissions', validate(saveSubmissionSchema), asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof saveSubmissionSchema>;
    const sub  = repos.stens.createSubmission({
      templateId:   body.templateId,
      ...(body.caseId       != null ? { caseId:       body.caseId }       : {}),
      ...(body.clientId     != null ? { clientId:     body.clientId }     : {}),
      ...(body.aiFilled     != null ? { aiFilled:     body.aiFilled }     : {}),
      ...(body.aiConfidence != null ? { aiConfidence: body.aiConfidence } : {}),
      fieldValues: JSON.stringify(body.fieldValues),
    });
    ok(res, sub, 201);
  }));

  router.get('/submissions/:id', asyncHandler(async (req, res) => {
    const id  = Number(req.params['id']);
    const sub = repos.stens.getSubmission(id);
    if (!sub) throw new NotFoundError(`submission ${id}`);
    ok(res, sub);
  }));

  router.patch('/submissions/:id', validate(updateSubmissionSchema), asyncHandler(async (req, res) => {
    const id   = Number(req.params['id']);
    const body = req.body as z.infer<typeof updateSubmissionSchema>;
    const sub  = repos.stens.updateSubmission(id, JSON.stringify(body.fieldValues), body.status);
    if (!sub) throw new NotFoundError(`submission ${id}`);
    ok(res, sub);
  }));

  router.get('/submissions', asyncHandler(async (req, res) => {
    const filters: { caseId?: number; clientId?: number } = {};
    if (req.query['caseId'])   filters.caseId   = Number(req.query['caseId']);
    if (req.query['clientId']) filters.clientId = Number(req.query['clientId']);
    ok(res, repos.stens.listSubmissions(filters));
  }));

  router.post('/content-update', validate(contentUpdateSchema), asyncHandler(async (req, res) => {
    const body   = req.body as z.infer<typeof contentUpdateSchema>;
    const result = repos.stens.applyContentUpdate(body.stensTemplates);
    ok(res, { version: body.version, ...result });
  }));

  return router;
}
