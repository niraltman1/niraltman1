import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, ActionPlanRepository, TaskRepository } from '@factum-il/database';
import { actionPlanRouter } from '../action-plan.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Documents (id INTEGER PRIMARY KEY AUTOINCREMENT, file_hash TEXT, original_path TEXT, storage_path TEXT, filename TEXT, extension TEXT, file_size_bytes INTEGER DEFAULT 0, mime_type TEXT, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE Tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal', due_date TEXT, client_id INTEGER, case_id INTEGER, document_id INTEGER, source TEXT DEFAULT 'manual', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE ActionPlan (
  plan_id        TEXT PRIMARY KEY,
  document_id    INTEGER,
  original_name  TEXT NOT NULL,
  suggested_name TEXT,
  source_folder  TEXT NOT NULL DEFAULT 'ידני',
  original_path  TEXT NOT NULL,
  suggested_path TEXT,
  action_type    TEXT NOT NULL DEFAULT 'RENAME',
  status         TEXT NOT NULL DEFAULT 'PENDING',
  ai_enriched    INTEGER NOT NULL DEFAULT 0,
  confidence     REAL,
  signed_at      TEXT,
  executed_at    TEXT,
  error_message  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function tokenFor(db: DatabaseConnection, username: string, role: string): string {
  const u = db.prepare('INSERT INTO system_users (username, role) VALUES (?, ?)').run(username, role);
  const token = `tok-${username}`;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(Number(u.lastInsertRowid), hash, new Date(Date.now() + 3_600_000).toISOString());
  return token;
}

function insertPlanEntry(db: DatabaseConnection, status = 'PENDING'): string {
  const planId = `plan-${Math.random().toString(36).slice(2)}`;
  db.prepare(`
    INSERT INTO ActionPlan (plan_id, original_name, source_folder, original_path, status)
    VALUES (?, 'מסמך.pdf', 'תיקייה', '/orig/מסמך.pdf', ?)
  `).run(planId, status);
  return planId;
}

describe('actionPlanRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    tokenFor(db, 'admin1', 'admin');

    const repos = {
      db,
      actionPlan: new ActionPlanRepository(db),
      tasks:      new TaskRepository(db),
      documents:  { updateStoragePath: () => {} },
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/action-plan', actionPlanRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('GET /', () => {
    it('rejects an invalid status query value with 4xx', async () => {
      const res = await request(app).get('/api/action-plan').query({ status: 'NOT_A_STATUS' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid status/limit query and returns a list', async () => {
      insertPlanEntry(db, 'PENDING');
      const res = await request(app).get('/api/action-plan').query({ status: 'PENDING', limit: 10 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('POST /approve', () => {
    it('rejects a body with a non-array planIds with 4xx', async () => {
      const res = await request(app).post('/api/action-plan/approve').send({ planIds: 'not-an-array' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an empty planIds array with 4xx', async () => {
      const res = await request(app).post('/api/action-plan/approve').send({ planIds: [] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed planIds array and persists the approval', async () => {
      const planId = insertPlanEntry(db, 'PENDING');
      const res = await request(app).post('/api/action-plan/approve').send({ planIds: [planId] });
      expect(res.status).toBe(200);
      expect(res.body.data.approved).toBe(1);

      const row = db.prepare('SELECT status FROM ActionPlan WHERE plan_id = ?').get(planId) as { status: string };
      expect(row.status).toBe('APPROVED');
    });
  });

  describe('POST /reject', () => {
    it('rejects a body with unknown extra keys with 4xx', async () => {
      const planId = insertPlanEntry(db, 'PENDING');
      const res = await request(app).post('/api/action-plan/reject').send({ planIds: [planId], extra: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed planIds array and persists the rejection', async () => {
      const planId = insertPlanEntry(db, 'PENDING');
      const res = await request(app).post('/api/action-plan/reject').send({ planIds: [planId] });
      expect(res.status).toBe(200);
      expect(res.body.data.rejected).toBe(1);

      const row = db.prepare('SELECT status FROM ActionPlan WHERE plan_id = ?').get(planId) as { status: string };
      expect(row.status).toBe('REJECTED');
    });
  });

  describe('POST /sign', () => {
    it('rejects a missing planIds field with 4xx', async () => {
      const res = await request(app).post('/api/action-plan/sign').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed planIds array, signs and creates review tasks', async () => {
      const planId = insertPlanEntry(db, 'PENDING');
      const res = await request(app).post('/api/action-plan/sign').send({ planIds: [planId] });
      expect(res.status).toBe(200);
      expect(res.body.data.totalEntries).toBe(1);

      const row = db.prepare('SELECT status FROM ActionPlan WHERE plan_id = ?').get(planId) as { status: string };
      expect(row.status).toBe('APPROVED');

      const tasks = db.prepare('SELECT * FROM Tasks').all() as Array<{ source: string }>;
      expect(tasks.length).toBe(1);
      expect(tasks[0]?.source).toBe('vacuum_protocol');
    });
  });

  describe('POST /execute', () => {
    it('rejects a planIds array with a non-uuid entry with 4xx', async () => {
      const res = await request(app).post('/api/action-plan/execute').send({ planIds: ['not-a-uuid'] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed planIds array of UUIDs', async () => {
      const res = await request(app).post('/api/action-plan/execute').send({
        planIds: ['11111111-1111-1111-1111-111111111111'],
      });
      expect(res.status).toBe(200);
      expect(res.body.data.executed).toBe(0);
      expect(res.body.data.failed).toBe(0);
    });
  });
});
