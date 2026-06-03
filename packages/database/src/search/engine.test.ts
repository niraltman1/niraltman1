import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { SearchEngine } from './engine.js';

// Minimal schema: base tables + standalone FTS5 mirrors keyed by rowid=id,
// matching the joins in SearchEngine (fts.rowid = <table>.id).
const SCHEMA = `
CREATE TABLE Cases   (id INTEGER PRIMARY KEY, title_he TEXT, case_number TEXT, status TEXT);
CREATE TABLE Clients (id INTEGER PRIMARY KEY, name_he TEXT, id_number TEXT, is_active INTEGER);
CREATE TABLE Documents (
  id INTEGER PRIMARY KEY, filename TEXT, document_type TEXT,
  processing_state TEXT, created_at TEXT
);
CREATE VIRTUAL TABLE fts_cases     USING fts5(title_he, case_number);
CREATE VIRTUAL TABLE fts_clients   USING fts5(name_he, id_number);
CREATE VIRTUAL TABLE fts_documents USING fts5(filename, ocr_text);
`;

describe('SearchEngine — canonical hit contract (frontend depends on this shape)', () => {
  let db: DatabaseConnection;
  let engine: SearchEngine;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);

    db.prepare("INSERT INTO Cases (id, title_he, case_number, status) VALUES (1, 'תביעה כספית', 'תא-2024-042', 'open')").run();
    db.prepare("INSERT INTO fts_cases (rowid, title_he, case_number) VALUES (1, 'תביעה כספית', 'תא-2024-042')").run();

    db.prepare("INSERT INTO Clients (id, name_he, id_number, is_active) VALUES (1, 'ישראל ישראלי', '123456782', 1)").run();
    db.prepare("INSERT INTO fts_clients (rowid, name_he, id_number) VALUES (1, 'ישראל ישראלי', '123456782')").run();

    db.prepare("INSERT INTO Documents (id, filename, document_type, processing_state, created_at) VALUES (1, 'תביעה.pdf', 'pleading', 'VERIFIED', '2026-01-01')").run();
    db.prepare("INSERT INTO fts_documents (rowid, filename, ocr_text) VALUES (1, 'תביעה.pdf', 'כתב תביעה כספית')").run();

    engine = new SearchEngine(db);
  });

  afterEach(() => db.close());

  it('returns hits with the {entityType,id,rank,snippet,title} shape', () => {
    const hits = engine.search('תביעה');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(['document', 'client', 'case']).toContain(h.entityType);
      expect(typeof h.id).toBe('number');
      expect(typeof h.rank).toBe('number');
      expect(typeof h.title).toBe('string');
      expect(typeof h.snippet).toBe('string');
    }
  });

  it('case hit exposes case_number in snippet and "number – title" in title', () => {
    const caseHit = engine.search('תביעה').find((h) => h.entityType === 'case');
    expect(caseHit).toBeDefined();
    expect(caseHit!.id).toBe(1);
    expect(caseHit!.snippet).toBe('תא-2024-042');
    expect(caseHit!.title).toContain('תא-2024-042');
    expect(caseHit!.title).toContain('תביעה כספית');
  });

  it('client hit exposes name in both title and snippet', () => {
    const clientHit = engine.search('ישראל').find((h) => h.entityType === 'client');
    expect(clientHit).toBeDefined();
    expect(clientHit!.id).toBe(1);
    expect(clientHit!.title).toBe('ישראל ישראלי');
  });

  it('document hit exposes filename as title', () => {
    const docHit = engine.search('תביעה').find((h) => h.entityType === 'document');
    expect(docHit).toBeDefined();
    expect(docHit!.title).toBe('תביעה.pdf');
  });

  it('returns [] for blank query', () => {
    expect(engine.search('   ')).toEqual([]);
  });
});
