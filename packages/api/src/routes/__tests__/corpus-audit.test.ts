import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, CorpusAuditRepository } from '@factum-il/database';
import { corpusAuditRouter } from '../corpus-audit.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE LegalSources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, title_he TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'statute', is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE LegalSections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL,
  section_label TEXT NOT NULL, verbatim_text_he TEXT NOT NULL, char_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE LegalSectionEmbeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL UNIQUE, source_id INTEGER NOT NULL,
  embedding TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'nomic-embed-text'
);
`;

describe('corpusAuditRouter — GET /api/corpus-audit', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    const repos = { db, corpusAudit: new CorpusAuditRepository(db) } as unknown as Repos;

    app = express();
    app.use('/api/corpus-audit', corpusAuditRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  it('returns a structured audit report with base targets', async () => {
    const res = await request(app).get('/api/corpus-audit');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.laws.target).toBe(1077);
    expect(res.body.data.verdicts.target).toBe(30000);
    expect(res.body.data.embeddings.dim).toBe(768);
    expect(Array.isArray(res.body.data.bottlenecks)).toBe(true);
  });

  it('reflects loaded laws and embedded-vs-FTS coverage', async () => {
    db.exec(`
      INSERT INTO LegalSources (source_key, title_he) VALUES ('law_a', 'חוק א');
      INSERT INTO LegalSections (source_id, section_label, verbatim_text_he, char_count)
        VALUES (1, 'סעיף 1', 'טקסט', 100), (1, 'סעיף 2', 'טקסט', 100);
      INSERT INTO LegalSectionEmbeddings (section_id, source_id, embedding) VALUES (1, 1, '[0.1]');
    `);
    const res = await request(app).get('/api/corpus-audit');
    expect(res.status).toBe(200);
    expect(res.body.data.laws.sources).toBe(1);
    expect(res.body.data.laws.sectionsEmbedded).toBe(1);
    expect(res.body.data.laws.sectionsFtsOnly).toBe(1);
    expect(res.body.data.rawText.totalChars).toBe(200);
  });
});
