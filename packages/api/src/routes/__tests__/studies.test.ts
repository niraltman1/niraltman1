import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection } from '@factum-il/database';
import { studiesRouter } from '../studies.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE AcademicSubjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name_he TEXT, name_en TEXT, description TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE AcademicCourses (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER, name_he TEXT, semester TEXT, year INTEGER, notes TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE StudyQuestions (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER, document_id INTEGER, question_he TEXT, option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, correct_answer TEXT, explanation TEXT, source_slide INTEGER, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE GraphNodes (id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER, label_he TEXT, node_type TEXT DEFAULT 'concept', parent_id INTEGER, position_x REAL DEFAULT 0, position_y REAL DEFAULT 0, metadata_json TEXT, created_at TEXT DEFAULT '2026-01-01');
CREATE TABLE Documents (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER, ocr_text TEXT);
`;

function buildApp(repos: Repos): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/studies', studiesRouter(repos));
  app.use(errorHandler);
  return app;
}

describe('studiesRouter — request validation (GH2)', () => {
  let db: DatabaseConnection;
  let app: express.Express;
  let repos: Repos;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repos = { db } as unknown as Repos;
    // Wire real repository implementations lazily via dynamic import would be heavier;
    // instead build minimal repos using the actual classes from @factum-il/database.
  });

  afterEach(() => db.close());

  describe('POST /subjects', () => {
    beforeEach(async () => {
      const { AcademicRepository, DocumentRepository } = await import('@factum-il/database');
      repos = {
        db,
        academic:  new AcademicRepository(db),
        documents: new DocumentRepository(db),
      } as unknown as Repos;
      app = buildApp(repos);
    });

    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/studies/subjects').send({ nameEn: 'Contracts' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects unknown keys with 4xx (strict schema)', async () => {
      const res = await request(app).post('/api/studies/subjects').send({ nameHe: 'חוזים', extra: 'nope' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/studies/subjects').send({ nameHe: 'חוזים', nameEn: 'Contracts' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameHe).toBe('חוזים');

      const row = db.prepare('SELECT * FROM AcademicSubjects WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['name_he']).toBe('חוזים');
    });
  });

  describe('POST /courses', () => {
    let subjectId: number;

    beforeEach(async () => {
      const { AcademicRepository, DocumentRepository } = await import('@factum-il/database');
      repos = {
        db,
        academic:  new AcademicRepository(db),
        documents: new DocumentRepository(db),
      } as unknown as Repos;
      app = buildApp(repos);

      const r = db.prepare(`INSERT INTO AcademicSubjects (name_he) VALUES ('חוזים')`).run();
      subjectId = Number(r.lastInsertRowid);
    });

    it('rejects a non-numeric subjectId with 4xx', async () => {
      const res = await request(app).post('/api/studies/courses').send({ subjectId: '1', nameHe: 'קורס א' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/studies/courses').send({ subjectId, nameHe: 'קורס א', year: 2026 });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.nameHe).toBe('קורס א');

      const row = db.prepare('SELECT * FROM AcademicCourses WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['subject_id']).toBe(subjectId);
    });
  });

  describe('POST /questions', () => {
    beforeEach(async () => {
      const { AcademicRepository, DocumentRepository } = await import('@factum-il/database');
      repos = {
        db,
        academic:  new AcademicRepository(db),
        documents: new DocumentRepository(db),
      } as unknown as Repos;
      app = buildApp(repos);
    });

    it('rejects an invalid correctAnswer enum value with 4xx', async () => {
      const res = await request(app).post('/api/studies/questions').send({
        questionHe: 'מהי תקופת ההתיישנות?',
        optionA: 'שנה', optionB: 'שנתיים', optionC: 'שלוש', optionD: 'שבע',
        correctAnswer: 'z',
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/studies/questions').send({
        questionHe: 'מהי תקופת ההתיישנות?',
        optionA: 'שנה', optionB: 'שנתיים', optionC: 'שלוש', optionD: 'שבע',
        correctAnswer: 'c',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.correctAnswer).toBe('c');

      const row = db.prepare('SELECT * FROM StudyQuestions WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['question_he']).toBe('מהי תקופת ההתיישנות?');
    });
  });

  describe('POST /generate-questions', () => {
    beforeEach(async () => {
      const { AcademicRepository, DocumentRepository } = await import('@factum-il/database');
      repos = {
        db,
        academic:  new AcademicRepository(db),
        documents: new DocumentRepository(db),
      } as unknown as Repos;
      app = buildApp(repos);
    });

    it('rejects a non-numeric documentId with 4xx', async () => {
      const res = await request(app).post('/api/studies/generate-questions').send({ documentId: 'abc' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an out-of-range count with 4xx', async () => {
      const res = await request(app).post('/api/studies/generate-questions').send({ documentId: 1, count: 100 });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body (404s on missing document, proving validation passed)', async () => {
      const res = await request(app).post('/api/studies/generate-questions').send({ documentId: 999 });
      // Validation passes; handler then 404s because the document doesn't exist.
      expect(res.status).toBe(404);
    });
  });

  describe('POST /nodes', () => {
    beforeEach(async () => {
      const { AcademicRepository, DocumentRepository } = await import('@factum-il/database');
      repos = {
        db,
        academic:  new AcademicRepository(db),
        documents: new DocumentRepository(db),
      } as unknown as Repos;
      app = buildApp(repos);
    });

    it('rejects a body missing required fields with 4xx', async () => {
      const res = await request(app).post('/api/studies/nodes').send({ nodeType: 'concept' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('accepts a well-formed body and persists it', async () => {
      const res = await request(app).post('/api/studies/nodes').send({ labelHe: 'חוזה' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.labelHe).toBe('חוזה');

      const row = db.prepare('SELECT * FROM GraphNodes WHERE id = ?').get(res.body.data.id) as Record<string, unknown>;
      expect(row['label_he']).toBe('חוזה');
    });
  });
});
