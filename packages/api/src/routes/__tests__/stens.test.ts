import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, StensRepository } from '@factum-il/database';
import { stensRouter } from '../stens.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE StensTemplates (id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT, name_en TEXT, category TEXT DEFAULT 'general', form_schema TEXT, instructions TEXT, legal_basis TEXT, version TEXT DEFAULT '1.0', content_hash TEXT, is_active INTEGER DEFAULT 1, last_updated TEXT DEFAULT '2026-01-01', created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE StensSubmissions (id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER, case_id INTEGER, client_id INTEGER, field_values TEXT, ai_filled INTEGER DEFAULT 0, ai_confidence REAL, status TEXT DEFAULT 'draft', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE Cases (id INTEGER PRIMARY KEY AUTOINCREMENT, case_number TEXT, title_he TEXT, court_name TEXT, judge_name TEXT);
CREATE TABLE Clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT, id_number TEXT);
`;

function buildApp(repos: Repos): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/stens', stensRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('stensRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let repos: Repos;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repos = { db, stens: new StensRepository(db) } as unknown as Repos;
    app = buildApp(repos);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: '{"name": "כהן"}' }),
    }));
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  describe('POST /templates', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/stens/templates').send({ nameHe: 'כתב תביעה' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid category enum with 4xx', async () => {
      const res = await request(app).post('/api/stens/templates').send({
        nameHe: 'כתב תביעה', category: 'space-law', formSchema: '[]',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/stens/templates').send({
        nameHe: 'כתב תביעה', category: 'civil', formSchema: '[]',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameHe).toBe('כתב תביעה');

      const row = db.prepare('SELECT * FROM StensTemplates WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['category']).toBe('civil');
    });
  });

  describe('POST /templates/:id/fill', () => {
    let templateId: number;

    beforeEach(() => {
      const r = db.prepare(
        `INSERT INTO StensTemplates (name_he, category, form_schema) VALUES ('כתב תביעה', 'civil', '[{"name":"clientName","labelHe":"שם הלקוח"}]')`,
      ).run();
      templateId = Number(r.lastInsertRowid);
    });

    it('rejects a non-numeric caseId with 4xx', async () => {
      const res = await request(app).post(`/api/stens/templates/${templateId}/fill`).send({ caseId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(app).post(`/api/stens/templates/${templateId}/fill`).send({ extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and creates a submission', async () => {
      const res = await request(app).post(`/api/stens/templates/${templateId}/fill`).send({
        context: { note: 'דחוף' },
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.submission.templateId).toBe(templateId);
    });
  });

  describe('POST /submissions', () => {
    let templateId: number;

    beforeEach(() => {
      const r = db.prepare(
        `INSERT INTO StensTemplates (name_he, category, form_schema) VALUES ('כתב תביעה', 'civil', '[]')`,
      ).run();
      templateId = Number(r.lastInsertRowid);
    });

    it('rejects a body missing fieldValues with 4xx', async () => {
      const res = await request(app).post('/api/stens/submissions').send({ templateId });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/stens/submissions').send({
        templateId, fieldValues: { clientName: 'כהן' }, aiFilled: false,
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templateId).toBe(templateId);

      const row = db.prepare('SELECT * FROM StensSubmissions WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(JSON.parse(row['field_values'] as string)).toEqual({ clientName: 'כהן' });
    });
  });

  describe('PATCH /submissions/:id', () => {
    let submissionId: number;
    let templateId: number;

    beforeEach(() => {
      const t = db.prepare(
        `INSERT INTO StensTemplates (name_he, category, form_schema) VALUES ('כתב תביעה', 'civil', '[]')`,
      ).run();
      templateId = Number(t.lastInsertRowid);
      const s = db.prepare(
        `INSERT INTO StensSubmissions (template_id, field_values) VALUES (?, '{}')`,
      ).run(templateId);
      submissionId = Number(s.lastInsertRowid);
    });

    it('rejects an invalid status enum with 4xx', async () => {
      const res = await request(app).patch(`/api/stens/submissions/${submissionId}`).send({
        fieldValues: { a: 1 }, status: 'archived',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).patch(`/api/stens/submissions/${submissionId}`).send({
        fieldValues: { clientName: 'לוי' }, status: 'completed',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');

      const row = db.prepare('SELECT * FROM StensSubmissions WHERE id = ?').get(submissionId) as Record<string, unknown>;
      expect(JSON.parse(row['field_values'] as string)).toEqual({ clientName: 'לוי' });
    });
  });

  describe('POST /content-update', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/stens/content-update').send({ version: '1.1' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and applies the update', async () => {
      const res = await request(app).post('/api/stens/content-update').send({
        version: '1.1',
        stensTemplates: [{
          nameHe: 'כתב הגנה', category: 'civil', formSchema: '[]', version: '1.1', contentHash: 'abc123',
        }],
        bundleHash: 'bundle-xyz',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applied).toBe(1);

      const row = db.prepare(`SELECT * FROM StensTemplates WHERE name_he = 'כתב הגנה'`).get() as Record<string, unknown>;
      expect(row['content_hash']).toBe('abc123');
    });
  });
});
