import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { adminRouter } from '../admin.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';
import type { RagHealingService } from '../../utils/rag-healing.js';

// ─── Mock the heavy subsystems admin.ts wires up — irrelevant to validation ──
vi.mock('../../utils/resource-controller.js', () => ({
  getStatus:    vi.fn().mockReturnValue({ mode: 'day' }),
  setTurboMode: vi.fn(),
}));
vi.mock('../../utils/seed-demo.js', () => ({ seedDemo: vi.fn().mockResolvedValue({}) }));
vi.mock('../../utils/vacuum-protocol.js', () => ({
  runVacuumProtocol: vi.fn().mockResolvedValue({ entries: [], dryRun: true }),
}));
vi.mock('../../utils/file-ingestion.js', () => ({
  reconfigureWatchFolders: vi.fn(),
  rescanFolder:            vi.fn().mockReturnValue(0),
}));
vi.mock('../../utils/judgment-library-ingestion.js', () => ({
  ingestJudgmentFolder: vi.fn().mockResolvedValue({ ingested: 0 }),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    statSync:   vi.fn().mockReturnValue({ isDirectory: () => true }),
  };
});
vi.mock('@factum-il/agent-core', () => ({
  getSystemMode:      vi.fn().mockReturnValue('single'),
  setSystemMode:      vi.fn(),
  assignCaseAccess:   vi.fn(),
  revokeCaseAccess:   vi.fn(),
  listCaseAssignments: vi.fn().mockReturnValue([]),
}));

const SCHEMA = `
CREATE TABLE system_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, role TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE user_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token_hash TEXT, expires_at TEXT);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, actor_id INTEGER, actor_role TEXT, resource_type TEXT, resource_id TEXT, action_detail TEXT, ip_address TEXT, user_agent TEXT, severity TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE CaseAssignments (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, user_id INTEGER, role TEXT DEFAULT 'attorney', assigned_at TEXT DEFAULT '2026-01-01', revoked_at TEXT);
`;

function tokenFor(db: DatabaseConnection, username: string, role: string): string {
  const u = db.prepare('INSERT INTO system_users (username, role) VALUES (?, ?)').run(username, role);
  const token = `tok-${username}`;
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(Number(u.lastInsertRowid), hash, new Date(Date.now() + 3_600_000).toISOString());
  return token;
}

describe('adminRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let adminTok: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    adminTok = tokenFor(db, 'admin1', 'admin');

    const fakeConfig = {
      getWatchFolders: vi.fn().mockReturnValue([]),
      setWatchFolders: vi.fn(),
      orgDirectory:    '/srv/data',
      setOrgDirectory: vi.fn(),
      toJSON:          vi.fn().mockReturnValue({}),
    };
    const repos = {
      db,
      backups:       { list: vi.fn(), record: vi.fn() },
      hardening:     { checkIntegrity: vi.fn() },
      queue:         { requeue: vi.fn(), getStats: vi.fn().mockReturnValue({ total: 0 }) },
      config:        fakeConfig,
      watcherEvents: { recent: vi.fn().mockReturnValue([]), stats: vi.fn().mockReturnValue({}) },
      processedFiles: { reset: vi.fn() },
      pipelineLogs:   { reset: vi.fn() },
      precedentLibrary: { getFullText: vi.fn(), delete: vi.fn() },
    } as unknown as Repos;

    const fakeHealing = { runHealingCycle: vi.fn() } as unknown as RagHealingService;

    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter(repos, fakeHealing));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  function authed(method: 'put' | 'post', path: string): request.Test {
    return (request(app)[method](path) as request.Test).set('Authorization', `Bearer ${adminTok}`);
  }

  describe('PUT /ingestion/folders', () => {
    it('rejects a non-array folders field with 4xx', async () => {
      const res = await authed('put', '/api/admin/ingestion/folders').send({ folders: 'not-an-array' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an array containing non-strings with 4xx', async () => {
      const res = await authed('put', '/api/admin/ingestion/folders').send({ folders: ['/a', 5] });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid string array', async () => {
      const res = await authed('put', '/api/admin/ingestion/folders').send({ folders: ['/srv/case-files'] });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /system/turbo', () => {
    it('rejects a non-boolean enabled field with 4xx', async () => {
      const res = await request(app).post('/api/admin/system/turbo').send({ enabled: 'yes' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid boolean', async () => {
      const res = await request(app).post('/api/admin/system/turbo').send({ enabled: true });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /settings', () => {
    it('rejects a missing orgDirectory with 4xx', async () => {
      const res = await request(app).post('/api/admin/settings').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an empty orgDirectory with 4xx', async () => {
      const res = await request(app).post('/api/admin/settings').send({ orgDirectory: '   ' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid orgDirectory', async () => {
      const res = await request(app).post('/api/admin/settings').send({ orgDirectory: 'C:\\Cases' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /vacuum/simulate', () => {
    it('rejects a non-string targetDir with 4xx', async () => {
      const res = await request(app).post('/api/admin/vacuum/simulate').send({ targetDir: 123 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a missing targetDir (falls back to orgDirectory)', async () => {
      const res = await request(app).post('/api/admin/vacuum/simulate').send({});
      expect(res.status).toBe(200);
    });
  });

  describe('POST /system-mode', () => {
    it('rejects an invalid mode value with 4xx', async () => {
      const res = await authed('post', '/api/admin/system-mode').send({ mode: 'turbo' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a valid mode value', async () => {
      const res = await authed('post', '/api/admin/system-mode').send({ mode: 'multi' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /case-assignments', () => {
    it('rejects a body with wrong field types with 4xx', async () => {
      const res = await authed('post', '/api/admin/case-assignments').send({ caseId: '1', userId: 2, role: 'attorney' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed assignment body', async () => {
      const res = await authed('post', '/api/admin/case-assignments').send({ caseId: 1, userId: 2, role: 'attorney' });
      expect(res.status).toBe(200);
    });
  });
});
