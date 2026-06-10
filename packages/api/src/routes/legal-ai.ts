import { Router } from 'express';
import { z } from 'zod';
import { generateLegalReasoning } from '../utils/ollama-legal-client.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ValidationError } from '../errors/api-error.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import type { Repos } from '../db.js';

const legalReasoningSchema = z.object({
  prompt:      z.string().min(1).optional(),
  temperature: z.number().min(0).max(1).optional(),
}).strict();

export function legalAiRouter(_repos: Repos): Router {
  const router = Router();

  router.post('/legal-reasoning', validate(legalReasoningSchema), asyncHandler(async (req, res) => {
    const { prompt, temperature } = req.body as z.infer<typeof legalReasoningSchema>;
    if (!prompt) throw new ValidationError('prompt is required');
    const result = await generateLegalReasoning(prompt, temperature);
    ok(res, { result });
  }));

  return router;
}
