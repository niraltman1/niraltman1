import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { vacuumRouter } from '../vacuum.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

// ─── Mock child_process.spawn so /start doesn't actually launch powershell.exe ──
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({ unref: vi.fn() }),
}));

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, actor_id INTEGER, actor_role TEXT, resource_type TEXT, resource_id TEXT, action_detail TEXT, ip_address TEXT, user_agent TEXT, severity TEXT, created_at TEXT DEFAULT '2026-01-01');
`;

function tokenFor(db: DatabaseConnection, username: string, role: string): string {
  const u = db.prepare('INSERT INTO system_users (username, role) VALUES (?, ?)').run(username, role);
  const token = `tok-${username}`;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(Number(u.lastInsertRowid), hash, new Date(Date.now() + 3_600_000).toISOString());
  return token;
}

describe('vacuumRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let fakeVacuum: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    listRecent: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    updateProgress: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    tokenFor(db, 'admin1', 'admin');

    fakeVacuum = {
      create:         vi.fn().mockReturnValue({ id: 1, sessionUuid: 'uuid-1' }),
      findById:       vi.fn().mockReturnValue({ id: 1, status: 'discovery' }),
      listRecent:     vi.fn().mockReturnValue([]),
      markFailed:     vi.fn(),
      updateProgress: vi.fn(),
    };

    const repos = { db, vacuum: fakeVacuum } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/vacuum', vacuumRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('POST /start', () => {
    it('rejects a non-Windows-absolute targetPath with 4xx', async () => {
      const res = await request(app).post('/api/vacuum/start').send({ targetPath: '/home/user/data' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(fakeVacuum.create).not.toHaveBeenCalled();
    });

    it('rejects a missing targetPath with 4xx', async () => {
      const res = await request(app).post('/api/vacuum/start').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed Windows path and starts a session', async () => {
      const res = await request(app).post('/api/vacuum/start').send({ targetPath: 'C:\\Cases\\Client1' });
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBe(1);
      expect(fakeVacuum.create).toHaveBeenCalledWith('C:\\Cases\\Client1');
    });
  });

  describe('POST /progress/:id', () => {
    it('rejects an invalid status enum value with 4xx', async () => {
      const res = await request(app)
        .post('/api/vacuum/progress/1')
        .send({ status: 'not_a_status', progress: 50, message: 'hello' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a progress value out of range with 4xx', async () => {
      const res = await request(app)
        .post('/api/vacuum/progress/1')
        .send({ status: 'processing_ocr', progress: 150, message: 'hello' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed progress update', async () => {
      const res = await request(app)
        .post('/api/vacuum/progress/1')
        .send({ status: 'processing_ocr', progress: 42, message: 'מעבד OCR', logLine: 'line 1\n' });
      expect(res.status).toBe(200);
      expect(res.body.data.updated).toBe(true);
      expect(fakeVacuum.updateProgress).toHaveBeenCalledWith(1, 'processing_ocr', 42, 'מעבד OCR', 'line 1\n');
    });
  });
});
