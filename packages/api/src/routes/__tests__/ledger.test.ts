import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { ledgerRouter } from '../ledger.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE client_payment_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  description_he TEXT,
  total_amount REAL,
  paid_amount REAL DEFAULT 0,
  due_date TEXT,
  payment_status TEXT DEFAULT 'PENDING',
  invoice_number TEXT,
  receipt_number TEXT,
  morning_doc_url TEXT,
  notes TEXT,
  created_at TEXT DEFAULT '2026-01-01',
  updated_at TEXT DEFAULT '2026-01-01'
);
`;

describe('ledgerRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/ledger', ledgerRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('GET /', () => {
    it('rejects a non-numeric clientId query param with 4xx', async () => {
      const res = await request(app).get('/api/ledger').query({ clientId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid numeric clientId and returns schedules + summary', async () => {
      db.prepare(`
        INSERT INTO client_payment_schedules (client_id, description_he, total_amount, paid_amount, due_date)
        VALUES (5, 'שכר טרחה', 1000, 200, '2026-12-01')
      `).run();

      const res = await request(app).get('/api/ledger').query({ clientId: '5' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.schedules).toHaveLength(1);
      expect(res.body.data.summary.totalAmount).toBe(1000);
    });
  });

  describe('POST /', () => {
    it('rejects a malformed body (missing required fields) with 4xx', async () => {
      const res = await request(app).post('/api/ledger').send({ clientId: 5 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a body with an invalid dueDate format with 4xx', async () => {
      const res = await request(app).post('/api/ledger').send({
        clientId: 5, descriptionHe: 'שכר טרחה', totalAmount: 1000, dueDate: '01/12/2026',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists the schedule', async () => {
      const res = await request(app).post('/api/ledger').send({
        clientId: 5, descriptionHe: 'שכר טרחה', totalAmount: 1000, dueDate: '2026-12-01', paidAmount: 100,
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const row = db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
        .get(res.body.data.id) as Record<string, unknown>;
      expect(row['client_id']).toBe(5);
      expect(row['description_he']).toBe('שכר טרחה');
      expect(row['paid_amount']).toBe(100);
    });
  });

  describe('PATCH /:id', () => {
    let scheduleId: number;

    beforeEach(() => {
      const r = db.prepare(`
        INSERT INTO client_payment_schedules (client_id, description_he, total_amount, paid_amount, due_date)
        VALUES (5, 'שכר טרחה', 1000, 0, '2026-12-01')
      `).run();
      scheduleId = Number(r.lastInsertRowid);
    });

    it('rejects an unknown field (strict schema) with 4xx', async () => {
      const res = await request(app)
        .patch(`/api/ledger/${scheduleId}`)
        .send({ paidAmount: 500, unknownField: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a negative paidAmount with 4xx', async () => {
      const res = await request(app)
        .patch(`/api/ledger/${scheduleId}`)
        .send({ paidAmount: -10 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed partial update and persists it', async () => {
      const res = await request(app)
        .patch(`/api/ledger/${scheduleId}`)
        .send({ paidAmount: 500, notes: 'תשלום חלקי' });
      expect(res.status).toBe(200);

      const row = db.prepare('SELECT * FROM client_payment_schedules WHERE id = ?')
        .get(scheduleId) as Record<string, unknown>;
      expect(row['paid_amount']).toBe(500);
      expect(row['notes']).toBe('תשלום חלקי');
    });
  });
});
