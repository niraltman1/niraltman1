import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { erasureRouter } from '../erasure.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, actor_id INTEGER, actor_role TEXT, resource_type TEXT, resource_id TEXT, action_detail TEXT, ip_address TEXT, user_agent TEXT, severity TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE erasure_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester_name TEXT, resource_type TEXT, resource_id INTEGER, reason TEXT, status TEXT DEFAULT 'pending', legal_hold INTEGER DEFAULT 0, completed_at TEXT, completed_by INTEGER, rejection_reason TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE Clients (id INTEGER PRIMARY KEY, id_number TEXT, phone TEXT, email TEXT, name_he TEXT, name_en TEXT, address_he TEXT, notes TEXT, id_number_encrypted INTEGER DEFAULT 0, phone_encrypted INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER);
CREATE TABLE Documents (id INTEGER PRIMARY KEY, case_id INTEGER, ocr_text TEXT);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY, name_he TEXT, name_en TEXT, phone TEXT, email TEXT);
CREATE TABLE encrypted_fields (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, row_id INTEGER);
`;

function tokenFor(db: DatabaseConnection, username: string, role: string): string {
  const u = db.prepare('INSERT INTO system_users (username, role) VALUES (?, ?)').run(username, role);
  const token = `tok-${username}`;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(Number(u.lastInsertRowid), hash, new Date(Date.now() + 3_600_000).toISOString());
  return token;
}

describe('erasureRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let adminTok: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    adminTok = tokenFor(db, 'admin1', 'admin');

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/erasure', erasureRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /request', () => {
    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/erasure/request').send({ requesterName: 'עו"ד כהן' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric resourceId with 4xx', async () => {
      const res = await request(app).post('/api/erasure/request').send({
        requesterName: 'עו"ד כהן', resourceType: 'client', resourceId: '5',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed request and persists it', async () => {
      const res = await request(app).post('/api/erasure/request').send({
        requesterName: 'עו"ד כהן', resourceType: 'client', resourceId: 5, reason: 'בקשת לקוח',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');

      const row = db.prepare('SELECT * FROM erasure_requests WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['requester_name']).toBe('עו"ד כהן');
      expect(row['resource_id']).toBe(5);
    });
  });

  describe('POST /:id/reject', () => {
    let requestId: number;

    beforeEach(() => {
      const r = db.prepare(
        `INSERT INTO erasure_requests (requester_name, resource_type, resource_id) VALUES ('עו"ד כהן', 'client', 5)`,
      ).run();
      requestId = Number(r.lastInsertRowid);
    });

    it('rejects a non-string reason with 4xx', async () => {
      const res = await request(app)
        .post(`/api/erasure/${requestId}/reject`)
        .set('Authorization', `Bearer ${adminTok}`)
        .send({ reason: 12345 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a missing reason and falls back to the default message', async () => {
      const res = await request(app)
        .post(`/api/erasure/${requestId}/reject`)
        .set('Authorization', `Bearer ${adminTok}`)
        .send({});
      expect(res.status).toBe(200);

      const row = db.prepare('SELECT rejection_reason FROM erasure_requests WHERE id = ?').get(requestId) as { rejection_reason: string };
      expect(row.rejection_reason).toBe('No reason provided');
    });

    it('accepts a well-formed reason and persists it', async () => {
      const res = await request(app)
        .post(`/api/erasure/${requestId}/reject`)
        .set('Authorization', `Bearer ${adminTok}`)
        .send({ reason: 'אין עילה למחיקה' });
      expect(res.status).toBe(200);

      const row = db.prepare('SELECT rejection_reason FROM erasure_requests WHERE id = ?').get(requestId) as { rejection_reason: string };
      expect(row.rejection_reason).toBe('אין עילה למחיקה');
    });
  });
});
