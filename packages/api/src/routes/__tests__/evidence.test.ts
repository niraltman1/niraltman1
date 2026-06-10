import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, EvidenceRepository } from '@factum-il/database';
import { evidenceRouter } from '../evidence.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

vi.mock('../../utils/file-hash.js', () => ({
  computeFileHash:   vi.fn().mockResolvedValue('deadbeef'.repeat(8)),
  mimeFromExtension: vi.fn().mockReturnValue('application/octet-stream'),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir:    vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    chmod:    vi.fn().mockResolvedValue(undefined),
    access:   vi.fn().mockRejectedValue(new Error('not found')),
  };
});

const SCHEMA = `
CREATE TABLE EvidenceItems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER, case_id INTEGER, client_id INTEGER,
  original_path TEXT, locker_path TEXT, file_hash TEXT, original_filename TEXT,
  mime_type TEXT, source_app TEXT DEFAULT 'whatsapp', media_type TEXT DEFAULT 'file',
  ocr_text TEXT, is_write_protected INTEGER DEFAULT 0, notes TEXT,
  locked_at TEXT DEFAULT '2026-01-01', created_at TEXT DEFAULT '2026-01-01'
);
`;

function buildApp(repos: Repos): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/evidence', evidenceRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('evidenceRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let repos: Repos;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repos = { db, evidence: new EvidenceRepository(db), processedFiles: {}, documents: {} } as unknown as Repos;
    app = buildApp(repos);
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  describe('POST /lock', () => {
    it('rejects a body missing sourcePath with 4xx', async () => {
      const res = await request(app).post('/api/evidence/lock').send({ caseId: 1 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid sourceApp enum with 4xx', async () => {
      const res = await request(app).post('/api/evidence/lock').send({
        sourcePath: '/tmp/file.txt', sourceApp: 'telegram',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/evidence/lock').send({
        sourcePath: '/tmp/file.txt', extra: 'nope',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists the locked item', async () => {
      const res = await request(app).post('/api/evidence/lock').send({
        sourcePath: '/tmp/recording.ogg', sourceApp: 'whatsapp', mediaType: 'voice_note', notes: 'הקלטה מהלקוח',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('locked');

      const row = db.prepare('SELECT * FROM EvidenceItems WHERE id = ?').get(res.body.data.evidenceId) as Record<string, unknown>;
      expect(row['original_filename']).toBe('recording.ogg');
      expect(row['notes']).toBe('הקלטה מהלקוח');
    });
  });
});
