import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, ProcessedFilesRepository } from '@factum-il/database';
import { mediaRouter } from '../media.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const ingestMock = vi.fn().mockResolvedValue({
  status: 'registered', fileHash: 'abc123', documentId: null, pdfPath: null, message: 'נרשם בהצלחה',
});

vi.mock('../../utils/media-pipeline.js', () => ({
  MediaPipeline: vi.fn().mockImplementation(() => ({ ingest: ingestMock })),
}));
vi.mock('../../utils/image-to-pdf.js', () => ({
  isTesseractAvailable:  vi.fn().mockResolvedValue(true),
  isImageMagickAvailable: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../utils/entity-router.js', () => ({
  routeEntities: vi.fn().mockResolvedValue(undefined),
}));

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT);
CREATE TABLE Cases (id INTEGER PRIMARY KEY, client_id INTEGER);
CREATE TABLE Documents (id INTEGER PRIMARY KEY, case_id INTEGER, ocr_text TEXT);
CREATE TABLE Evidence (id INTEGER PRIMARY KEY);
CREATE TABLE Contacts (id INTEGER PRIMARY KEY);
CREATE TABLE pipeline_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE ProcessedFiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT, original_path TEXT, current_path TEXT, original_name TEXT,
  converted_pdf_path TEXT, file_size_bytes INTEGER, mime_type TEXT,
  processing_status TEXT DEFAULT 'pending', skip_reason TEXT, ocr_text_preview TEXT,
  document_id INTEGER, client_id INTEGER, metadata_json TEXT,
  last_scanned TEXT DEFAULT '2026-01-01', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
`;

describe('mediaRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const repos = {
      db,
      processedFiles: new ProcessedFilesRepository(db),
      documents:    {},
      evidence:     {},
      clients:      {},
      cases:        {},
      pipelineLogs: { summary: () => ({ total: 0, byStatus: {} }) },
      contacts:     {},
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/media', mediaRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => { db.close(); vi.clearAllMocks(); });

  describe('GET /registry', () => {
    it('rejects an out-of-range pageSize with 4xx', async () => {
      const res = await request(app).get('/api/media/registry').query({ pageSize: '5000' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric page with 4xx', async () => {
      const res = await request(app).get('/api/media/registry').query({ page: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed query and returns the registry', async () => {
      const res = await request(app).get('/api/media/registry').query({ page: '1', pageSize: '20', status: 'complete' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(20);
    });

    it('accepts an empty query (defaults applied)', async () => {
      const res = await request(app).get('/api/media/registry');
      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(50);
    });
  });

  describe('POST /ingest', () => {
    it('rejects a missing filePath with 4xx', async () => {
      const res = await request(app).post('/api/media/ingest').send({ clientId: 1 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-numeric clientId with 4xx', async () => {
      const res = await request(app).post('/api/media/ingest').send({ filePath: '/tmp/scan.pdf', clientId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/media/ingest').send({ filePath: '/tmp/scan.pdf', notARealField: 1 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and invokes the pipeline', async () => {
      const res = await request(app).post('/api/media/ingest').send({ filePath: '/tmp/scan.pdf', clientId: 5 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('registered');
      expect(ingestMock).toHaveBeenCalledWith(expect.objectContaining({ filePath: resolve('/tmp/scan.pdf'), clientId: 5 }));
    });
  });
});
