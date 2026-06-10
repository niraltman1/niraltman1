import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { bugReportRouter } from '../bug-report.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE WorkerHealth (id INTEGER PRIMARY KEY AUTOINCREMENT, worker_type TEXT, status TEXT, last_heartbeat TEXT DEFAULT '2026-01-01');
CREATE TABLE _migrations (version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT DEFAULT '2026-01-01');
`;

describe('bugReportRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let homeDir: string;
  let prevHome: string | undefined;
  let prevUserProfile: string | undefined;

  beforeEach(async () => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    // Redirect "Desktop" output to a temp dir so the test never touches a real desktop.
    homeDir = await mkdtemp(join(tmpdir(), 'factum-il-bugreport-'));
    await mkdir(join(homeDir, 'Desktop'), { recursive: true });
    prevHome = process.env['HOME'];
    prevUserProfile = process.env['USERPROFILE'];
    process.env['HOME'] = homeDir;
    process.env['USERPROFILE'] = homeDir;

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/bug-report', bugReportRouter(repos));
    app.use(errorHandler);
  });

  afterEach(async () => {
    db.close();
    if (prevHome !== undefined) process.env['HOME'] = prevHome; else delete process.env['HOME'];
    if (prevUserProfile !== undefined) process.env['USERPROFILE'] = prevUserProfile; else delete process.env['USERPROFILE'];
    await rm(homeDir, { recursive: true, force: true });
  });

  describe('POST /', () => {
    it('rejects a malformed body (non-string activeRoute) with 4xx', async () => {
      const res = await request(app).post('/api/bug-report').send({ activeRoute: 12345 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown extra keys (.strict()) with 4xx', async () => {
      const res = await request(app).post('/api/bug-report').send({ activeRoute: '/cases', extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and writes a zip to the desktop path', async () => {
      const res = await request(app).post('/api/bug-report')
        .send({ activeRoute: '/cases/5', userDescription: 'התקלה: הכפתור לא מגיב' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.zipName).toMatch(/^FactumIL_Beta_Bug_.*\.zip$/);

      const desktopFiles = await readdir(join(homeDir, 'Desktop'));
      expect(desktopFiles).toContain(res.body.data.zipName);
    });

    it('accepts an empty body', async () => {
      const res = await request(app).post('/api/bug-report').send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
