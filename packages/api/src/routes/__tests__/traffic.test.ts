import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, TrafficCasesRepository } from '@factum-il/database';
import { trafficRouter } from '../traffic.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER, title_he TEXT, case_number TEXT);
CREATE TABLE TrafficCases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL UNIQUE,
  lifecycle_state TEXT NOT NULL DEFAULT 'request_to_stand_trial',
  request_date TEXT, ingestion_date TEXT, summons_date TEXT, closed_date TEXT,
  statute_deadline TEXT,
  rejection_detected INTEGER DEFAULT 0,
  rejection_keywords TEXT, rejection_excerpt TEXT, rejection_document_id INTEGER,
  police_file_number TEXT, prosecution_entity TEXT, offense_description TEXT, notes TEXT,
  driving_license_number TEXT,
  identity_node_type TEXT DEFAULT 'id_number',
  created_at TEXT, updated_at TEXT
);
`;

describe('trafficRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let caseId: number;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const client = db.prepare(`INSERT INTO Clients (name_he) VALUES ('לקוח לדוגמה')`).run();
    const c = db.prepare(`INSERT INTO Cases (client_id, title_he, case_number) VALUES (?, 'תיק תעבורה', 'תא-2024-001')`)
      .run(Number(client.lastInsertRowid));
    caseId = Number(c.lastInsertRowid);

    const repos = {
      db,
      cases: { findById: (id: number) => (id === caseId ? { id: caseId, clientId: Number(client.lastInsertRowid) } : null) },
      trafficCases: new TrafficCasesRepository(db),
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/traffic', trafficRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /', () => {
    it('rejects a missing caseId with 4xx', async () => {
      const res = await request(app).post('/api/traffic').send({ notes: 'הערה' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric caseId with 4xx', async () => {
      const res = await request(app).post('/api/traffic').send({ caseId: '5' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/traffic').send({
        caseId, policeFileNumber: '12345', notes: 'הערה ראשונית',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.caseId).toBe(caseId);

      const row = db.prepare('SELECT * FROM TrafficCases WHERE case_id = ?').get(caseId) as Record<string, unknown>;
      expect(row['police_file_number']).toBe('12345');
    });
  });

  describe('PATCH /:caseId/state', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO TrafficCases (case_id, created_at, updated_at) VALUES (?, '2026-01-01', '2026-01-01')`).run(caseId);
    });

    it('rejects an invalid state with 4xx', async () => {
      const res = await request(app).patch(`/api/traffic/${caseId}/state`).send({ state: 'not_a_real_state' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid state transition', async () => {
      const res = await request(app).patch(`/api/traffic/${caseId}/state`).send({ state: 'police_ingestion', date: '2026-02-01' });
      expect(res.status).toBe(200);
      expect(res.body.data.lifecycleState).toBe('police_ingestion');
    });
  });

  describe('POST /:caseId/rejection', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO TrafficCases (case_id, created_at, updated_at) VALUES (?, '2026-01-01', '2026-01-01')`).run(caseId);
    });

    it('rejects a body with empty keywords array with 4xx', async () => {
      const res = await request(app).post(`/api/traffic/${caseId}/rejection`).send({ keywords: [], excerpt: 'קטע מהמסמך' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-string excerpt with 4xx', async () => {
      const res = await request(app).post(`/api/traffic/${caseId}/rejection`).send({ keywords: ['התיישנות'], excerpt: 123 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed rejection record', async () => {
      const res = await request(app).post(`/api/traffic/${caseId}/rejection`).send({
        keywords: ['התיישנות', 'דחייה'], excerpt: 'קטע מהמסמך המעיד על דחייה',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.rejectionRecorded).toBe(true);

      const row = db.prepare('SELECT rejection_detected, rejection_excerpt FROM TrafficCases WHERE case_id = ?').get(caseId) as Record<string, unknown>;
      expect(row['rejection_detected']).toBe(1);
      expect(row['rejection_excerpt']).toBe('קטע מהמסמך המעיד על דחייה');
    });
  });

  describe('PATCH /:caseId/metadata', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO TrafficCases (case_id, created_at, updated_at) VALUES (?, '2026-01-01', '2026-01-01')`).run(caseId);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).patch(`/api/traffic/${caseId}/metadata`).send({ notARealField: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid identityNodeType with 4xx', async () => {
      const res = await request(app).patch(`/api/traffic/${caseId}/metadata`).send({ identityNodeType: 'fingerprint' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed metadata update and persists it', async () => {
      const res = await request(app).patch(`/api/traffic/${caseId}/metadata`).send({
        prosecutionEntity: 'פרקליטות', drivingLicenseNumber: '987654321', identityNodeType: 'driving_license',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.prosecutionEntity).toBe('פרקליטות');

      const row = db.prepare('SELECT driving_license_number, identity_node_type FROM TrafficCases WHERE case_id = ?').get(caseId) as Record<string, unknown>;
      expect(row['driving_license_number']).toBe('987654321');
      expect(row['identity_node_type']).toBe('driving_license');
    });
  });
});
