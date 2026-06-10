import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mailRouter } from '../mail.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

function buildApp(repos: Repos): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/mail', mailRouter(repos));
  app.use(errorHandler);
  return app;
}

function buildRepos(caseRow: Record<string, unknown> | null): Repos {
  return {
    cases: { findById: vi.fn().mockReturnValue(caseRow) },
    search: { search: vi.fn().mockReturnValue([{ snippet: 'תוכן רלוונטי מהתיק' }]) },
  } as unknown as Repos;
}

describe('mailRouter — request validation (GH2)', () => {
  let app: express.Express;
  let repos: Repos;

  beforeEach(() => {
    repos = buildRepos({ id: 1, caseNumber: 'תא-2024-042' });
    app = buildApp(repos);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'טיוטת תגובה לדוגמה עם תוכן רלוונטי מהתיק' }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('POST /generate-reply', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/mail/generate-reply').send({ caseId: 1, tone: 'formal' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid tone enum with 4xx', async () => {
      const res = await request(app).post('/api/mail/generate-reply').send({
        caseId: 1, tone: 'angry', emailBody: 'שלום, אני פונה אליך בעניין התיק.',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/mail/generate-reply').send({
        caseId: 1, tone: 'formal', emailBody: 'שלום, אני פונה אליך בעניין התיק.', extra: 'nope',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and returns a generated draft', async () => {
      const res = await request(app).post('/api/mail/generate-reply').send({
        emailId: 'msg-1', caseId: 1, tone: 'formal', emailBody: 'שלום, אני פונה אליך בעניין התיק.',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.draftBody).toBe('string');
      expect(res.body.data.draftBody.length).toBeGreaterThan(0);
    });

    it('coerces a numeric-string caseId and proceeds', async () => {
      const res = await request(app).post('/api/mail/generate-reply').send({
        caseId: '1', tone: 'formal', emailBody: 'שלום, אני פונה אליך בעניין התיק.',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
