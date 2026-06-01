import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { SmartCollectionsRepository } from './smart-collections.js';

const SCHEMA = `
CREATE TABLE Documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, processing_state TEXT,
  document_type TEXT, case_id INTEGER, created_at TEXT
);
CREATE TABLE DocumentInsights (
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER, verification_state TEXT
);
CREATE TABLE court_hearings (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id INTEGER);
`;

describe('SmartCollectionsRepository (M7)', () => {
  let db: DatabaseConnection;
  let repo: SmartCollectionsRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare("INSERT INTO Documents (id, filename, processing_state, case_id, created_at) VALUES (1, 'a.pdf', 'OCR_PENDING', 1, '2026-01-01')").run();
    db.prepare("INSERT INTO Documents (id, filename, processing_state, case_id, created_at) VALUES (2, 'b.pdf', 'VERIFIED', 1, '2026-01-02')").run();
    db.prepare("INSERT INTO Documents (id, filename, processing_state, case_id, created_at) VALUES (3, 'c.pdf', 'REVIEW_PENDING', 9, '2026-01-03')").run();
    db.prepare("INSERT INTO DocumentInsights (document_id, verification_state) VALUES (2, 'unverified')").run();
    db.prepare("INSERT INTO court_hearings (case_id) VALUES (1)").run(); // case 1 has a hearing
    repo = new SmartCollectionsRepository(db);
  });

  afterEach(() => db.close());

  it('unverified = documents with an unverified insight', () => {
    expect(repo.items('unverified').map((d) => d.id)).toEqual([2]);
  });

  it('ocr_pending = documents awaiting OCR/review', () => {
    expect(repo.items('ocr_pending').map((d) => d.id).sort()).toEqual([1, 3]);
  });

  it('hearing = documents on matters that have a hearing', () => {
    // docs 1 and 2 are on case 1 (which has a hearing); doc 3 is on case 9 (none)
    expect(repo.items('hearing').map((d) => d.id).sort()).toEqual([1, 2]);
  });

  it('recent returns all, newest first', () => {
    expect(repo.items('recent').map((d) => d.id)).toEqual([3, 2, 1]);
  });

  it('overview reports live counts for every collection', () => {
    const ov = Object.fromEntries(repo.overview().map((c) => [c.key, c.count]));
    expect(ov['unverified']).toBe(1);
    expect(ov['ocr_pending']).toBe(2);
    expect(ov['hearing']).toBe(2);
    expect(ov['recent']).toBe(3);
  });
});
