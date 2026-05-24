import { Router } from 'express';
import { generateLegalReasoning } from '../utils/ollama-legal-client.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ValidationError } from '../errors/api-error.js';
import { ok } from '../utils/response.js';
import type { Repos } from '../db.js';

export function legalAiRouter(_repos: Repos): Router {
  const router = Router();

  router.post('/legal-reasoning', asyncHandler(async (req, res) => {
    const { prompt, temperature } = req.body as { prompt?: string; temperature?: number };
    if (!prompt) throw new ValidationError('prompt is required');
    const result = await generateLegalReasoning(prompt, temperature);
    ok(res, { result });
  }));

  return router;
}
