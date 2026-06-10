import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { tabularRouter } from '../tabular.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Documents (id INTEGER PRIMARY KEY AUTOINCREMENT, file_hash TEXT, original_path TEXT, storage_path TEXT, filename TEXT, extension TEXT, file_size_bytes INTEGER, mime_type TEXT, case_id INTEGER, client_id INTEGER, document_type TEXT, document_date TEXT, ocr_text TEXT, tags TEXT, processing_state TEXT DEFAULT 'DISCOVERED', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE DocumentInsights (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER, case_number TEXT);
CREATE TABLE ProcessedFiles (id INTEGER PRIMARY KEY AUTOINCREMENT, file_hash TEXT, original_path TEXT, current_path TEXT, original_name TEXT, file_size_bytes INTEGER, mime_type TEXT, processing_status TEXT DEFAULT 'pending', document_id INTEGER, client_id INTEGER, created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
`;

// ── Minimal stub repositories (mirrors tabular-engine.test.ts) ───────────────
const docStore: Record<string, unknown> = {};
const mockDocs = {
  findByHash: (_h: string) => null,
  create:     (data: unknown) => { const id = Object.keys(docStore).length + 1; docStore[id] = data; return { id }; },
} as unknown as Repos['documents'];

const mockPf = {
  findByHash:   (_h: string) => null,
  register:     () => {},
  updateStatus: () => {},
} as unknown as Repos['processedFiles'];

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TMP = join(tmpdir(), `factum-il-tabular-route-${randomUUID()}`);
let csvPath = '';

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });
  csvPath = join(TMP, 'test-legal.csv');
  const csvContent = [
    'מספר תיק,שם לקוח,עו"ד,תאריך',
    '1234-05-2026,כהן יוסף,עו"ד אבי לוי,15.05.2026',
  ].join('\n');
  await writeFile(csvPath, csvContent, 'utf-8');
});

afterAll(async () => {
  await unlink(csvPath).catch(() => undefined);
});

describe('tabularRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = { db, documents: mockDocs, processedFiles: mockPf } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/tabular', tabularRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /ingest', () => {
    it('rejects a malformed body (non-string filePath) with 4xx', async () => {
      const res = await request(app).post('/api/tabular/ingest').send({ filePath: 12345 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown extra keys (.strict()) with 4xx', async () => {
      const res = await request(app).post('/api/tabular/ingest').send({ filePath: csvPath, extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric ceilPercent with 4xx', async () => {
      const res = await request(app).post('/api/tabular/ingest').send({ filePath: csvPath, ceilPercent: '70' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and ingests the file', async () => {
      const res = await request(app).post('/api/tabular/ingest').send({ filePath: csvPath, ceilPercent: 70 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rowCount).toBeGreaterThan(0);
      expect(res.body.data.fileHash).toBeTruthy();
    });
  });
});
