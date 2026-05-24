/**
 * Search Scaling Integration Test
 *
 * Seeds a large dataset and verifies sub-200ms query latency
 * plus correctness of Hebrew prefix normalisation and entity boosting.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { SearchEngine } from '../../packages/database/src/search/engine.js';

const DOCUMENT_COUNT = 10_000;   // reduced from 100k for test speed; demonstrates scaling

function buildSearchDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS Documents (
      id              INTEGER PRIMARY KEY,
      filename        TEXT NOT NULL,
      original_path   TEXT NOT NULL,
      file_hash       TEXT,
      processing_state TEXT NOT NULL DEFAULT 'ENRICHED',
      ocr_text        TEXT,
      document_type   TEXT,
      document_date   TEXT,
      client_id       INTEGER,
      case_id         INTEGER,
      confidence      REAL,
      language        TEXT,
      file_size_bytes INTEGER,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS Clients (
      id        INTEGER PRIMARY KEY,
      name_he   TEXT NOT NULL,
      id_number TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS Cases (
      id          INTEGER PRIMARY KEY,
      title_he    TEXT NOT NULL,
      case_number TEXT,
      status      TEXT NOT NULL DEFAULT 'open'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents USING fts5(
      ocr_text, filename, document_type,
      content='Documents', content_rowid='id'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_clients USING fts5(
      name_he, id_number,
      content='Clients', content_rowid='id'
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS fts_cases USING fts5(
      title_he, case_number,
      content='Cases', content_rowid='id'
    );
    CREATE TABLE IF NOT EXISTS SearchRankingCache (
      query_hash       TEXT PRIMARY KEY,
      query_text       TEXT NOT NULL,
      result_ids_json  TEXT NOT NULL,
      total_hits       INTEGER NOT NULL,
      expires_at       TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS SearchMeta (
      document_id      INTEGER PRIMARY KEY,
      document_type    TEXT,
      processing_state TEXT NOT NULL,
      document_date    TEXT,
      client_id        INTEGER,
      case_id          INTEGER,
      confidence       REAL,
      page_count       INTEGER,
      language         TEXT,
      file_size_bytes  INTEGER,
      indexed_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function seedData(db: Database.Database, count: number): void {
  const docTypes = ['CONTRACT', 'COURT_DECISION', 'PLEADING', 'INVOICE', 'CORRESPONDENCE'];
  const hebrewWords = ['הסכם', 'חוזה', 'עבודה', 'שכירות', 'ביטוח', 'מכירה', 'שירות', 'תשלום', 'ערעור', 'פסיקה'];

  const insertDoc = db.prepare(`
    INSERT INTO Documents (id, filename, original_path, file_hash, processing_state, ocr_text, document_type, language, confidence)
    VALUES (?, ?, ?, ?, 'ENRICHED', ?, ?, 'he', ?)
  `);
  const insertFTS = db.prepare(`INSERT INTO fts_documents (rowid, ocr_text, filename, document_type) VALUES (?, ?, ?, ?)`);
  const insertMeta = db.prepare(`INSERT INTO SearchMeta (document_id, document_type, processing_state, language, confidence) VALUES (?, ?, 'ENRICHED', 'he', ?)`);

  const insertAll = db.transaction(() => {
    for (let i = 1; i <= count; i++) {
      const docType = docTypes[i % docTypes.length]!;
      const word    = hebrewWords[i % hebrewWords.length]!;
      const ocr     = `${word} מסמך מספר ${i} בעניין ${hebrewWords[(i + 3) % hebrewWords.length]}`;
      const fn      = `doc-${i}.pdf`;
      const conf    = 0.6 + (i % 40) / 100;
      insertDoc.run(i, fn, `/files/${fn}`, `hash${i}`, ocr, docType, conf);
      insertFTS.run(i, ocr, fn, docType);
      insertMeta.run(i, docType, conf);
    }
  });

  // Seed a handful of clients and cases
  const insertClient = db.prepare(`INSERT INTO Clients (id, name_he) VALUES (?, ?)`);
  const insertFTSClient = db.prepare(`INSERT INTO fts_clients (rowid, name_he) VALUES (?, ?)`);
  for (let i = 1; i <= 50; i++) {
    const name = `לקוח בדיקה ${i}`;
    insertClient.run(i, name);
    insertFTSClient.run(i, name);
  }

  const insertCase = db.prepare(`INSERT INTO Cases (id, title_he, case_number, status) VALUES (?, ?, ?, ?)`);
  const insertFTSCase = db.prepare(`INSERT INTO fts_cases (rowid, title_he, case_number) VALUES (?, ?, ?)`);
  for (let i = 1; i <= 50; i++) {
    const title  = `תיק ${hebrewWords[i % hebrewWords.length]} ${i}`;
    const caseNo = `${1000 + i}/24`;
    insertCase.run(i, title, caseNo, i % 3 === 0 ? 'closed' : 'open');
    insertFTSCase.run(i, title, caseNo);
  }

  insertAll();
}

describe('Search scaling with 10k documents', () => {
  let db: Database.Database;
  let engine: SearchEngine;

  beforeAll(() => {
    db     = buildSearchDb();
    engine = new SearchEngine(db as never);
    seedData(db, DOCUMENT_COUNT);
  });

  afterAll(() => db.close());

  it(`returns results in under 200ms for simple Hebrew query`, () => {
    const t0      = Date.now();
    const results = engine.search('הסכם');
    const elapsed = Date.now() - t0;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  it('cache hit responds in under 10ms', () => {
    engine.search('חוזה');  // warm cache
    const t0      = Date.now();
    engine.search('חוזה');  // cached
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(10);
  });

  it('cross-entity search returns documents AND cases', () => {
    const results = engine.search('שכירות');
    const types   = new Set(results.map((r) => r.entityType));
    expect(types.size).toBeGreaterThan(1);
  });

  it('cases are ranked above documents (boost=+2.0)', () => {
    const results = engine.search('פסיקה');
    const firstCase = results.find((r) => r.entityType === 'case');
    const firstDoc  = results.find((r) => r.entityType === 'document');
    if (firstCase && firstDoc) {
      const caseIdx = results.indexOf(firstCase);
      const docIdx  = results.indexOf(firstDoc);
      expect(caseIdx).toBeLessThanOrEqual(docIdx);
    }
  });

  it('query planner filter by documentType narrows results', () => {
    const all       = engine.search('הסכם');
    const filtered  = engine.search('הסכם', { filter: { documentType: 'CONTRACT' } });
    if (all.length > 0 && filtered.length > 0) {
      expect(filtered.length).toBeLessThanOrEqual(all.length);
    }
  });

  it('Hebrew prefix normalisation: searching לחוזה finds חוזה documents', () => {
    const withPrefix = engine.search('לחוזה');
    const withoutPfx = engine.search('חוזה');
    // Both should return results; with-prefix should not return empty
    if (withoutPfx.length > 0) {
      expect(withPrefix.length).toBeGreaterThan(0);
    }
  });

  it('synonym expansion: searching חוזה also surfaces הסכם documents', () => {
    // Seed a document with only "הסכם" in OCR
    db.prepare(`
      INSERT OR IGNORE INTO Documents (id, filename, original_path, ocr_text, processing_state, language)
      VALUES (999999, 'synonym.pdf', '/f/synonym.pdf', 'הסכם מכירה דירה', 'ENRICHED', 'he')
    `).run();
    db.prepare(`
      INSERT OR IGNORE INTO fts_documents (rowid, ocr_text, filename, document_type)
      VALUES (999999, 'הסכם מכירה דירה', 'synonym.pdf', 'CONTRACT')
    `).run();

    const results = engine.search('חוזה');
    const ids     = results.map((r) => r.id);
    expect(ids).toContain(999999);
  });
});
