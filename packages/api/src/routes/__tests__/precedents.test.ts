import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { precedentsRouter } from '../precedents.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE legal_precedents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  citation TEXT, case_title TEXT, court_level TEXT, decision_date TEXT, summary_he TEXT,
  created_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE precedent_deep_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, precedent_id INTEGER,
  legal_analogy TEXT, distinguishing_risks TEXT, drafted_arguments TEXT,
  model_version TEXT, confidence REAL, created_at TEXT DEFAULT '2026-01-01'
);
`;

describe('precedentsRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/precedents', precedentsRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /', () => {
    it('rejects a missing citation with 4xx', async () => {
      const res = await request(app).post('/api/precedents').send({ case_title: 'תיק לדוגמה' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid court_level with 4xx', async () => {
      const res = await request(app).post('/api/precedents').send({
        citation: 'בג"ץ 6821/93', court_level: 'tribunal',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/precedents').send({
        citation: 'בג"ץ 6821/93', notARealField: 'x',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/precedents').send({
        citation: 'בג"ץ 6821/93', case_title: 'פלוני נ׳ מדינת ישראל',
        court_level: 'supreme', decision_date: '1994-01-01', summary_he: 'תקדים חשוב',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.citation).toBe('בג"ץ 6821/93');

      const row = db.prepare('SELECT * FROM legal_precedents WHERE citation = ?').get('בג"ץ 6821/93') as Record<string, unknown>;
      expect(row['court_level']).toBe('supreme');
      expect(row['summary_he']).toBe('תקדים חשוב');
    });
  });
});
