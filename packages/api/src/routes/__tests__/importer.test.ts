import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { importerRouter } from '../importer.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

vi.mock('../../utils/net-hamishpat-parser.js', () => ({
  importNetHaMishpatCSV: vi.fn().mockResolvedValue({ imported: 1, skipped: 0, total: 1 }),
}));
vi.mock('../../utils/archive-miner.js', () => ({
  mineArchive: vi.fn().mockResolvedValue({ scanned: 1, ingested: 1, skipped: 0 }),
}));
vi.mock('../../utils/excel-importer.js', () => ({
  importExcelFile: vi.fn().mockResolvedValue({ imported: 1, skipped: 0, total: 1 }),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

import { importNetHaMishpatCSV } from '../../utils/net-hamishpat-parser.js';
import { mineArchive } from '../../utils/archive-miner.js';
import { importExcelFile } from '../../utils/excel-importer.js';

const SCHEMA = `
CREATE TABLE Cases (id INTEGER PRIMARY KEY, case_number TEXT);
CREATE TABLE court_hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, case_number TEXT,
  hearing_date TEXT, hearing_time TEXT, courtroom TEXT, judge_name TEXT,
  hearing_type TEXT, ical_uid TEXT, raw_summary TEXT
);
`;

describe('importerRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = { db } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/importer', importerRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('POST /net-hamishpat', () => {
    it('rejects a missing filePath with 4xx', async () => {
      const res = await request(app).post('/api/importer/net-hamishpat').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-string filePath with 4xx', async () => {
      const res = await request(app).post('/api/importer/net-hamishpat').send({ filePath: 123 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and invokes the importer', async () => {
      const res = await request(app).post('/api/importer/net-hamishpat').send({ filePath: '/tmp/export.csv' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(importNetHaMishpatCSV).toHaveBeenCalledWith(expect.anything(), '/tmp/export.csv');
    });
  });

  describe('POST /archive-mine', () => {
    it('rejects a missing rootDir with 4xx', async () => {
      const res = await request(app).post('/api/importer/archive-mine').send({ limit: 10 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a limit over the max with 4xx', async () => {
      const res = await request(app).post('/api/importer/archive-mine').send({ rootDir: '/tmp/legacy', limit: 100_000 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/importer/archive-mine').send({ rootDir: '/tmp/legacy', notARealField: true });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and invokes the miner', async () => {
      const res = await request(app).post('/api/importer/archive-mine').send({ rootDir: '/tmp/legacy', limit: 100, force: true });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mineArchive).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rootDir: '/tmp/legacy', limit: 100, force: true }));
    });
  });

  describe('POST /excel', () => {
    it('rejects an invalid sourceType with 4xx', async () => {
      const res = await request(app).post('/api/importer/excel').send({ filePath: '/tmp/file.xlsx', sourceType: 'unknown_type' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a missing filePath with 4xx', async () => {
      const res = await request(app).post('/api/importer/excel').send({ sourceType: 'generic' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body (defaulting sourceType) and invokes the importer', async () => {
      const res = await request(app).post('/api/importer/excel').send({ filePath: '/tmp/file.xlsx' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(importExcelFile).toHaveBeenCalledWith(expect.anything(), '/tmp/file.xlsx', 'generic', 'file.xlsx');
    });
  });

  describe('POST /ical', () => {
    it('rejects a missing filePath with 4xx', async () => {
      const res = await request(app).post('/api/importer/ical').send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/importer/ical').send({ filePath: '/tmp/cal.ics', extra: 1 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });
});
