import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { caseLawRouter } from '../case-law.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

// ─── Mock the AI three-step relevance tester — irrelevant to body validation ─
vi.mock('../../utils/case-law-tester.js', () => ({
  runThreeStepTest: vi.fn().mockResolvedValue({
    step1Passed: true, step2Passed: true, step3Passed: false,
    stepsPassed: 2,
    step1Reason: 'r1', step2Reason: 'r2', step3Reason: 'r3',
    citationString: 'תא-2024-042',
  }),
}));

const SCHEMA = `
CREATE TABLE global_case_law (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  citation TEXT, case_title TEXT, court_level TEXT, decision_date TEXT,
  governing_law TEXT, offense_clause TEXT, summary_he TEXT,
  source TEXT DEFAULT 'manual', created_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, notes TEXT, procedure_type TEXT, case_type TEXT);
CREATE TABLE case_law_relevance_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_law_id INTEGER, case_id INTEGER,
  step1_passed INTEGER, step2_passed INTEGER, step3_passed INTEGER, steps_passed INTEGER,
  step1_reason TEXT, step2_reason TEXT, step3_reason TEXT, citation_string TEXT,
  tested_at TEXT DEFAULT '2026-01-01'
);
`;

describe('caseLawRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/case-law', caseLawRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('GET /', () => {
    it('rejects an invalid source enum value with 4xx', async () => {
      const res = await request(app).get('/api/case-law').query({ source: 'imaginary' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown query param (strict schema) with 4xx', async () => {
      const res = await request(app).get('/api/case-law').query({ unknownFilter: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed query and returns paginated results', async () => {
      db.prepare(`INSERT INTO global_case_law (citation, case_title, source) VALUES ('תא-2024-042', 'תיק לדוגמה', 'manual')`).run();

      const res = await request(app).get('/api/case-law').query({ source: 'manual', page: '1', pageSize: '10' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(10);
    });
  });

  describe('POST /', () => {
    it('rejects a body missing citation with 4xx', async () => {
      const res = await request(app).post('/api/case-law').send({ caseTitle: 'תיק לדוגמה' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid courtLevel enum value with 4xx', async () => {
      const res = await request(app).post('/api/case-law').send({ citation: 'תא-2024-042', courtLevel: 'imaginary' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid decisionDate format with 4xx', async () => {
      const res = await request(app).post('/api/case-law').send({ citation: 'תא-2024-042', decisionDate: '01/01/2024' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists the precedent', async () => {
      const res = await request(app).post('/api/case-law').send({
        citation: 'תא-2024-042', caseTitle: 'תיק לדוגמה', courtLevel: 'magistrate',
        decisionDate: '2024-01-15', source: 'manual',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const row = db.prepare('SELECT * FROM global_case_law WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['citation']).toBe('תא-2024-042');
      expect(row['court_level']).toBe('magistrate');
    });
  });

  describe('POST /:id/test', () => {
    let lawId: number;

    beforeEach(() => {
      const r = db.prepare(`INSERT INTO global_case_law (citation, source) VALUES ('תא-2024-042', 'manual')`).run();
      lawId = Number(r.lastInsertRowid);
      db.prepare(`INSERT INTO Cases (id, notes, procedure_type, case_type) VALUES (1, 'הערות', 'civil', 'civil')`).run();
    });

    it('rejects a body missing caseId with 4xx', async () => {
      const res = await request(app).post(`/api/case-law/${lawId}/test`).send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric caseId with 4xx', async () => {
      const res = await request(app).post(`/api/case-law/${lawId}/test`).send({ caseId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body, runs the test, and persists the result', async () => {
      const res = await request(app).post(`/api/case-law/${lawId}/test`).send({ caseId: 1 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.badge).toBe('[2/3 Steps Passed]');

      const row = db.prepare('SELECT * FROM case_law_relevance_tests WHERE case_law_id = ?').get(lawId) as Record<string, unknown>;
      expect(row['case_id']).toBe(1);
      expect(row['steps_passed']).toBe(2);
    });
  });
});
