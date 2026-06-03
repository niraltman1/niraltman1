import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { populateEntityGraph, backfillEntityGraph, entityGraphStats } from './entity-graph.js';

// Mirrors migrations/042_ontology.sql (Entities + EntityRelations) plus the minimal
// Documents / DocumentInsights needed for the backfill query.
const SCHEMA = `
CREATE TABLE Entities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  canonical   TEXT NOT NULL,
  aliases     TEXT NOT NULL DEFAULT '[]',
  case_id     INTEGER,
  document_id INTEGER,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(kind, canonical)
);
CREATE TABLE EntityRelations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id    INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
  relation   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(from_id, to_id, relation)
);
CREATE TABLE Documents (id INTEGER PRIMARY KEY, case_id INTEGER);
CREATE TABLE DocumentInsights (
  document_id INTEGER, case_number TEXT, court_name TEXT, judge_name TEXT
);
`;

describe('populateEntityGraph', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
  });
  afterEach(() => db.close());

  it('creates Judge/Court/Case entities and three relations', () => {
    const r = populateEntityGraph(db, {
      documentId: 1,
      caseId: 10,
      caseNumber: 'תא-2024-042',
      courtName: 'שלום תל אביב',
      judgeName: "כב' השופט כהן",
    });
    expect(r.judgeId).toBeGreaterThan(0);
    expect(r.courtId).toBeGreaterThan(0);
    expect(r.caseEntityId).toBeGreaterThan(0);
    expect(r.relations).toBe(3);

    const kinds = db.prepare('SELECT kind, canonical FROM Entities ORDER BY kind').all() as { kind: string; canonical: string }[];
    expect(kinds.map((k) => k.kind)).toEqual(['Case', 'Court', 'Judge']);
    // honorific stripped
    expect(kinds.find((k) => k.kind === 'Judge')?.canonical).toBe('כהן');

    const rels = db.prepare('SELECT relation FROM EntityRelations ORDER BY relation').all() as { relation: string }[];
    expect(rels.map((x) => x.relation)).toEqual(['hears', 'presides_over', 'sits_in']);
  });

  it('is idempotent — repeated calls do not duplicate', () => {
    const fields = { documentId: 1, caseId: 10, caseNumber: 'תא-2024-042', courtName: 'שלום תל אביב', judgeName: "השופט כהן" };
    populateEntityGraph(db, fields);
    populateEntityGraph(db, fields);
    const entityCount = (db.prepare('SELECT COUNT(*) AS n FROM Entities').get() as { n: number }).n;
    const relCount = (db.prepare('SELECT COUNT(*) AS n FROM EntityRelations').get() as { n: number }).n;
    expect(entityCount).toBe(3);
    expect(relCount).toBe(3);
  });

  it('skips empty / honorific-only names without creating blank entities', () => {
    const r = populateEntityGraph(db, {
      documentId: 2, caseId: null, caseNumber: '  ', courtName: '', judgeName: null,
    });
    expect(r.judgeId).toBeNull();
    expect(r.courtId).toBeNull();
    expect(r.caseEntityId).toBeNull();
    expect((db.prepare('SELECT COUNT(*) AS n FROM Entities').get() as { n: number }).n).toBe(0);
  });

  it('creates only the case entity when judge/court are absent (no relations)', () => {
    const r = populateEntityGraph(db, {
      documentId: 3, caseId: 5, caseNumber: 'עב-2024-001', courtName: null, judgeName: null,
    });
    expect(r.caseEntityId).toBeGreaterThan(0);
    expect(r.relations).toBe(0);
  });

  it('backfills from existing DocumentInsights and reports stats', () => {
    db.exec(`
      INSERT INTO Documents (id, case_id) VALUES (1, 10), (2, 10), (3, NULL);
      INSERT INTO DocumentInsights (document_id, case_number, court_name, judge_name) VALUES
        (1, 'תא-2024-042', 'שלום תל אביב', 'השופט כהן'),
        (2, 'תא-2024-042', 'שלום תל אביב', 'השופט לוי'),
        (3, NULL, NULL, NULL);
    `);
    const res = backfillEntityGraph(db);
    expect(res.documents).toBe(2); // row 3 has no usable fields

    const stats = entityGraphStats(db);
    expect(stats.byKind['Judge']).toBe(2);   // כהן + לוי
    expect(stats.byKind['Court']).toBe(1);    // shared court, deduped
    expect(stats.byKind['Case']).toBe(1);     // shared case number, deduped
    expect(stats.totalEntities).toBe(4);
    expect(stats.relations).toBeGreaterThan(0);
  });
});
