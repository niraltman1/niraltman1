import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { queueRouter } from '../queue.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE Documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, ocr_text TEXT,
  processing_state TEXT DEFAULT 'pending'
);
CREATE TABLE DocumentInsights (
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL,
  case_number TEXT, court_name TEXT, judge_name TEXT, offense_type TEXT,
  next_hearing TEXT, document_type TEXT
);
CREATE TABLE LearningFeedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER,
  field_name TEXT, original_value TEXT, corrected_value TEXT,
  created_at TEXT DEFAULT '2026-01-01'
);
CREATE TABLE ProcessingQueue (
  id TEXT PRIMARY KEY, current_state TEXT, is_poisoned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '2026-01-01', updated_at TEXT DEFAULT '2026-01-01'
);
`;

describe('queueRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let documentId: number;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    const doc = db.prepare(`INSERT INTO Documents (processing_state) VALUES ('review_pending')`).run();
    documentId = Number(doc.lastInsertRowid);
    db.prepare(`INSERT INTO DocumentInsights (document_id, case_number) VALUES (?, 'תא-2024-001')`).run(documentId);

    const repos = {
      db,
      queue:     {},
      documents: { findById: (id: number) => (id === documentId ? { id: documentId, ocrText: '' } : null) },
    } as unknown as Repos;

    app = express();
    app.use(express.json());
    app.use('/api/queue', queueRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  describe('POST /correct/:id', () => {
    it('rejects a missing field_name with 4xx', async () => {
      const res = await request(app).post(`/api/queue/correct/${documentId}`).send({ corrected_value: 'ערך מתוקן' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects a non-string corrected_value with 4xx', async () => {
      const res = await request(app).post(`/api/queue/correct/${documentId}`).send({ field_name: 'judge_name', corrected_value: 123 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an unknown key with 4xx (strict schema)', async () => {
      const res = await request(app).post(`/api/queue/correct/${documentId}`).send({
        field_name: 'judge_name', corrected_value: 'השופט כהן', notARealField: 'x',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body, records feedback, and updates the writable field', async () => {
      const res = await request(app).post(`/api/queue/correct/${documentId}`).send({
        field_name: 'judge_name', original_value: 'לא ידוע', corrected_value: 'השופט כהן',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(true);

      const feedback = db.prepare('SELECT * FROM LearningFeedback WHERE document_id = ?').get(documentId) as Record<string, unknown>;
      expect(feedback['field_name']).toBe('judge_name');
      expect(feedback['corrected_value']).toBe('השופט כהן');

      const insight = db.prepare('SELECT judge_name FROM DocumentInsights WHERE document_id = ?').get(documentId) as Record<string, unknown>;
      expect(insight['judge_name']).toBe('השופט כהן');
    });

    it('accepts a body without original_value', async () => {
      const res = await request(app).post(`/api/queue/correct/${documentId}`).send({
        field_name: 'court_name', corrected_value: 'בית משפט השלום',
      });
      expect(res.status).toBe(200);

      const feedback = db.prepare('SELECT original_value FROM LearningFeedback WHERE document_id = ? AND field_name = ?')
        .get(documentId, 'court_name') as Record<string, unknown>;
      expect(feedback['original_value']).toBeNull();
    });
  });
});
