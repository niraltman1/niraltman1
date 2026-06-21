import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseConnection, CorpusAuditRepository } from '@factum-il/database';
import { legalAuditRouter } from '../legal-audit.js';
import { errorHandler } from '../../middleware/error.js';
import type { Repos } from '../../db.js';

const SCHEMA = `
CREATE TABLE LegalSources (id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT UNIQUE, title_he TEXT, is_active INTEGER DEFAULT 1);
CREATE TABLE LegalSections (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER, section_label TEXT, verbatim_text_he TEXT, char_count INTEGER DEFAULT 0);
CREATE TABLE LegalCitationGraph (id INTEGER PRIMARY KEY AUTOINCREMENT, source_document_id TEXT, target_document_id TEXT, citation_type TEXT DEFAULT 'cites');
`;

describe('legalAuditRouter — GET /api/legal/audit', () => {
  let db: DatabaseConnection;
  let app: express.Express;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    const repos = { db, corpusAudit: new CorpusAuditRepository(db) } as unknown as Repos;
    app = express();
    app.use('/api/legal', legalAuditRouter(repos));
    app.use(errorHandler);
  });

  afterEach(() => db.close());

  it('returns the exact flat contract shape', async () => {
    const res = await request(app).get('/api/legal/audit');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'char_count', 'chunks', 'citation_edges', 'embedded_chunks',
      'embedded_documents', 'law_sections', 'laws', 'verdicts',
    ]);
    // Absent verdict/chunk tables ⇒ defensive zeros, not an error.
    expect(res.body.verdicts).toBe(0);
    expect(res.body.chunks).toBe(0);
  });

  it('reflects loaded laws, char volume and citation edges', async () => {
    db.exec(`
      INSERT INTO LegalSources (source_key, title_he) VALUES ('law_a', 'חוק א');
      INSERT INTO LegalSections (source_id, section_label, verbatim_text_he, char_count)
        VALUES (1, 'סעיף 1', 'טקסט', 120);
      INSERT INTO LegalCitationGraph (source_document_id, target_document_id, citation_type)
        VALUES ('FDOC-1','FDOC-2','followed');
    `);
    const res = await request(app).get('/api/legal/audit');
    expect(res.body.laws).toBe(1);
    expect(res.body.law_sections).toBe(1);
    expect(res.body.char_count).toBe(120);
    expect(res.body.citation_edges).toBe(1);
  });
});
