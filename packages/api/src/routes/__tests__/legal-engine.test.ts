import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, LegalEngineRepository, TaskRepository } from '@factum-il/database';
import { legalEngineRouter } from '../legal-engine.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

vi.mock('../../utils/regulation-parser.js', () => ({
  parseRegulationIntoMilestones: vi.fn().mockResolvedValue({
    caseType: 'תאונת דרכים', legalBasis: 'חוק הפיצויים', milestones: [],
  }),
}));

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, title_he TEXT, case_number TEXT);
CREATE TABLE Tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal', due_date TEXT, client_id INTEGER, case_id INTEGER, document_id INTEGER,
  source TEXT DEFAULT 'manual', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE RegulationTemplates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_type TEXT, name_he TEXT, name_en TEXT,
  legal_basis TEXT, source_url TEXT, source_text TEXT, status TEXT DEFAULT 'draft',
  ai_generated INTEGER DEFAULT 0, approved_at TEXT, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE TemplateMilestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER, sequence_order INTEGER,
  title_he TEXT, title_en TEXT, description TEXT, day_offset INTEGER, anchor TEXT DEFAULT 'filing',
  is_mandatory INTEGER DEFAULT 1, task_priority TEXT DEFAULT 'normal', created_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE CaseProcedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER UNIQUE, template_id INTEGER,
  anchor_date TEXT, status TEXT DEFAULT 'active', notes TEXT,
  created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
`;

describe('legalEngineRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let caseId: number;
  let clientId: number;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const client = db.prepare(`INSERT INTO Clients (name_he) VALUES ('לקוח לדוגמה')`).run();
    clientId = Number(client.lastInsertRowid);
    const c = db.prepare(`INSERT INTO Cases (client_id, title_he, case_number) VALUES (?, 'תיק לדוגמה', 'תא-2024-002')`)
      .run(clientId);
    caseId = Number(c.lastInsertRowid);

    const repos = {
      db,
      cases: { findById: (id: number) => (id === caseId ? { id: caseId, clientId } : null) },
      tasks: new TaskRepository(db),
      legalEngine: new LegalEngineRepository(db),
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/legal-engine', legalEngineRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('GET /templates', () => {
    it('rejects an invalid status query value with 4xx', async () => {
      const res = await request(app).get('/api/legal-engine/templates').query({ status: 'not_a_status' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid status query value', async () => {
      const res = await request(app).get('/api/legal-engine/templates').query({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('accepts no query at all', async () => {
      const res = await request(app).get('/api/legal-engine/templates');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /learn', () => {
    it('rejects a too-short sourceText with 4xx', async () => {
      const res = await request(app).post('/api/legal-engine/learn').send({
        caseType: 'תאונת דרכים', legalBasis: 'חוק הפיצויים', sourceText: 'קצר',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and returns the parsed skeleton', async () => {
      const res = await request(app).post('/api/legal-engine/learn').send({
        caseType: 'תאונת דרכים', legalBasis: 'חוק הפיצויים לנפגעי תאונות דרכים',
        sourceText: 'זהו טקסט מקור ארוך מספיק לצורך בדיקת הולידציה של הסכמה',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /templates', () => {
    it('rejects a body missing milestones with 4xx', async () => {
      const res = await request(app).post('/api/legal-engine/templates').send({
        caseType: 'תאונת דרכים', nameHe: 'תבנית לדוגמה',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/legal-engine/templates').send({
        caseType: 'תאונת דרכים', nameHe: 'תבנית לדוגמה', milestones: [{ titleHe: 'שלב א' }], notARealField: 1,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists the template + milestones', async () => {
      const res = await request(app).post('/api/legal-engine/templates').send({
        caseType: 'תאונת דרכים', nameHe: 'תבנית תאונות דרכים',
        milestones: [{ titleHe: 'הגשת תביעה', dayOffset: 0, anchor: 'filing' }],
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.milestones).toHaveLength(1);

      const row = db.prepare('SELECT * FROM RegulationTemplates WHERE case_type = ?').get('תאונת דרכים') as Record<string, unknown>;
      expect(row['name_he']).toBe('תבנית תאונות דרכים');
    });
  });

  describe('POST /cases/:caseId/apply-template', () => {
    let templateId: number;

    beforeEach(() => {
      const tpl = db.prepare(`INSERT INTO RegulationTemplates (case_type, name_he, status) VALUES ('תאונת דרכים', 'תבנית', 'active')`).run();
      templateId = Number(tpl.lastInsertRowid);
      db.prepare(`
        INSERT INTO TemplateMilestones (template_id, sequence_order, title_he, day_offset, anchor, task_priority)
        VALUES (?, 1, 'הגשת תביעה', 0, 'filing', 'normal')
      `).run(templateId);
    });

    it('rejects a malformed anchorDate with 4xx', async () => {
      const res = await request(app).post(`/api/legal-engine/cases/${caseId}/apply-template`).send({
        templateId, anchorDate: '01/01/2026',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric templateId with 4xx', async () => {
      const res = await request(app).post(`/api/legal-engine/cases/${caseId}/apply-template`).send({
        templateId: 'abc', anchorDate: '2026-01-01',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and applies the template', async () => {
      const res = await request(app).post(`/api/legal-engine/cases/${caseId}/apply-template`).send({
        templateId, anchorDate: '2026-01-01',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.tasksCreated).toBe(1);

      const row = db.prepare('SELECT * FROM CaseProcedures WHERE case_id = ?').get(caseId) as Record<string, unknown>;
      expect(row['template_id']).toBe(templateId);
    });
  });

  describe('PATCH /cases/:caseId/procedure', () => {
    beforeEach(() => {
      const tpl = db.prepare(`INSERT INTO RegulationTemplates (case_type, name_he, status) VALUES ('תאונת דרכים', 'תבנית', 'active')`).run();
      db.prepare(`INSERT INTO CaseProcedures (case_id, template_id, anchor_date) VALUES (?, ?, '2026-01-01')`)
        .run(caseId, Number(tpl.lastInsertRowid));
    });

    it('rejects an invalid status value with 4xx', async () => {
      const res = await request(app).patch(`/api/legal-engine/cases/${caseId}/procedure`).send({ status: 'not_a_status' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed update and persists it', async () => {
      const res = await request(app).patch(`/api/legal-engine/cases/${caseId}/procedure`).send({ status: 'completed', notes: 'הושלם' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');

      const row = db.prepare('SELECT status, notes FROM CaseProcedures WHERE case_id = ?').get(caseId) as Record<string, unknown>;
      expect(row['status']).toBe('completed');
      expect(row['notes']).toBe('הושלם');
    });
  });
});
