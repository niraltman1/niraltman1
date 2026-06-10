import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../utils/ollama-legal-client.js', () => ({
  generateLegalReasoning: vi.fn().mockResolvedValue('תשובה משפטית לדוגמה'),
}));

import { generateLegalReasoning } from '../../utils/ollama-legal-client.js';
import { legalAiRouter } from '../legal-ai.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

function buildApp(): express.Express {
  const repos = {} as unknown as Repos;
  const app = express();
  app.use(express.json());
  app.use('/api/legal-ai', legalAiRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('legalAiRouter — request validation (GH2)', () => {
  afterEach(() => vi.clearAllMocks());

  describe('POST /legal-reasoning', () => {
    it('rejects a non-string prompt with 4xx', async () => {
      const res = await request(buildApp()).post('/api/legal-ai/legal-reasoning').send({ prompt: 12345 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an out-of-range temperature with 4xx', async () => {
      const res = await request(buildApp()).post('/api/legal-ai/legal-reasoning').send({
        prompt: 'מה הדין החל על המקרה?', temperature: 5,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(buildApp()).post('/api/legal-ai/legal-reasoning').send({
        prompt: 'מה הדין החל על המקרה?', extra: 'not-allowed',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed prompt and returns the AI result', async () => {
      const res = await request(buildApp()).post('/api/legal-ai/legal-reasoning').send({
        prompt: 'מה הדין החל על המקרה?', temperature: 0.2,
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result).toBe('תשובה משפטית לדוגמה');
      expect(generateLegalReasoning).toHaveBeenCalledWith('מה הדין החל על המקרה?', 0.2);
    });
  });
});
