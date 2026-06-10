import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, DocumentRepository, TaskRepository } from '@factum-il/database';
import { canvasRouter } from '../canvas.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT);
CREATE TABLE Documents (id INTEGER PRIMARY KEY AUTOINCREMENT, file_hash TEXT UNIQUE NOT NULL, original_path TEXT NOT NULL, storage_path TEXT NOT NULL, filename TEXT NOT NULL, extension TEXT NOT NULL, file_size_bytes INTEGER NOT NULL DEFAULT 0, mime_type TEXT, language TEXT DEFAULT 'he', case_id INTEGER, client_id INTEGER, document_type TEXT, document_date TEXT, ocr_text TEXT, tags TEXT, processing_state TEXT DEFAULT 'DISCOVERED', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
CREATE TABLE DocumentInsights (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER, summary TEXT);
CREATE TABLE Tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal', due_date TEXT, client_id INTEGER, case_id INTEGER, document_id INTEGER, source TEXT DEFAULT 'manual', created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01');
`;

function insertDocument(db: DatabaseConnection): number {
  const r = db.prepare(`
    INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes)
    VALUES ('hash-1', '/orig/a.pdf', '/store/a.pdf', 'a.pdf', 'pdf', 1024)
  `).run();
  return Number(r.lastInsertRowid);
}

describe('canvasRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let docId: number;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    docId = insertDocument(db);

    const repos = {
      db,
      documents: new DocumentRepository(db),
      tasks:     new TaskRepository(db),
    } as unknown as Repos;
    app = express();
    app.use(express.json());
    app.use('/api/canvas', canvasRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /document/:id/tasks', () => {
    it('rejects a body missing the required title with 4xx', async () => {
      const res = await request(app).post(`/api/canvas/document/${docId}/tasks`).send({ description: 'תיאור' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an invalid priority enum value with 4xx', async () => {
      const res = await request(app).post(`/api/canvas/document/${docId}/tasks`)
        .send({ title: 'משימה', priority: 'urgent-ish' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown extra keys (.strict()) with 4xx', async () => {
      const res = await request(app).post(`/api/canvas/document/${docId}/tasks`)
        .send({ title: 'משימה', extra: 'נוסף' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists a linked task', async () => {
      const res = await request(app).post(`/api/canvas/document/${docId}/tasks`)
        .send({ title: 'להגיש כתב הגנה', description: 'תיאור קצר', dueDate: '2026-07-01', priority: 'high' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('להגיש כתב הגנה');

      const row = db.prepare('SELECT * FROM Tasks WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['document_id']).toBe(docId);
      expect(row['priority']).toBe('high');
    });
  });
});
