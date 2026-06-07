import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mock everything below the validation layer (agentsRouter wires:           ──
//     requireAuth → validate(schema) → withCaseExecutionGuard → asyncHandler)   ──
// We only care that malformed bodies are rejected by `validate` before reaching
// any of this, and that well-formed bodies pass validation through to it.       ──

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as Record<string, unknown>)['username'] = 'tester';
    next();
  },
}));

vi.mock('../../middleware/case-execution-guard.js', () => ({
  withCaseExecutionGuard: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    r['traceId']       = 'trace-1';
    r['caseStateHash'] = 'hash-1';
    next();
  },
}));

vi.mock('@factum-il/agent-core', () => ({
  checkExecutionValidity: vi.fn().mockReturnValue({ valid: true }),
  markAgentCompleted:     vi.fn(),
  markAgentFailed:        vi.fn(),
  journalEvent:           vi.fn(),
}));

vi.mock('../../modules/agents/case-summarizer.js', () => ({
  summarizeCase: vi.fn().mockResolvedValue({ summary: 'ok' }),
}));
vi.mock('../../modules/agents/timeline-builder.js', () => ({
  buildTimeline: vi.fn().mockResolvedValue({ events: [] }),
}));
vi.mock('../../modules/agents/research-agent.js', () => ({
  researchLegalQuestion: vi.fn().mockResolvedValue({ answer: 'ok' }),
}));
vi.mock('../../modules/agents/contract-review.js', () => ({
  reviewContract: vi.fn().mockResolvedValue({ review: 'ok' }),
}));
vi.mock('../../modules/agents/discovery-agent.js', () => ({
  runDiscovery: vi.fn().mockResolvedValue({ findings: [] }),
}));

import { agentsRouter } from '../agents.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

function buildApp(caseExists = true, documentExists = true): express.Express {
  const fakeDb = {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      get: vi.fn().mockReturnValue(
        sql.includes('FROM Cases')     ? (caseExists ? { id: 1 } : undefined)
        : sql.includes('FROM Documents') ? (documentExists ? { id: 1 } : undefined)
        : undefined,
      ),
    })),
  };
  const repos = { db: fakeDb } as unknown as Repos;

  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentsRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('agentsRouter — request validation (GH2)', () => {
  afterEach(() => vi.clearAllMocks());

  describe('POST /summarize', () => {
    it('rejects a missing caseId with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/summarize').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric caseId with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/summarize').send({ caseId: '1' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown extra fields (strict schema) with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/summarize').send({ caseId: 1, extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('passes a valid numeric caseId through to the handler', async () => {
      const res = await request(buildApp(true)).post('/api/agents/summarize').send({ caseId: 1 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /research', () => {
    it('rejects an empty question with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/research').send({ question: '' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-string question with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/research').send({ question: 123 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('passes a valid question through to the handler (caseId optional)', async () => {
      const res = await request(buildApp()).post('/api/agents/research').send({ question: 'מה הדין?' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /contract-review', () => {
    it('rejects a missing documentId with 4xx', async () => {
      const res = await request(buildApp()).post('/api/agents/contract-review').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('passes a valid numeric documentId through to the handler', async () => {
      const res = await request(buildApp(true, true)).post('/api/agents/contract-review').send({ documentId: 1 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
