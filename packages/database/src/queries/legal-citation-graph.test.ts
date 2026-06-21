import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { LegalCitationGraphRepository, computeAuthorityScore } from './legal-citation-graph.js';

// Mirrors migrations/087_legal_citation_graph.sql (inline so the test is self-contained).
const SCHEMA = `
CREATE TABLE LegalCitationGraph (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_document_id TEXT NOT NULL,
  target_document_id TEXT NOT NULL,
  citation_type TEXT NOT NULL DEFAULT 'cites'
    CHECK (citation_type IN ('cites','followed','applied','approved','distinguished','criticized','overruled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_document_id, target_document_id, citation_type)
);
`;

describe('LegalCitationGraphRepository', () => {
  let db: DatabaseConnection;
  let repo: LegalCitationGraphRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new LegalCitationGraphRepository(db);
  });
  afterEach(() => db.close());

  it('counts inbound treatment and classifies positive/negative/neutral', () => {
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-LEADING', citationType: 'followed' });
    repo.addCitation({ sourceDocumentId: 'FDOC-2', targetDocumentId: 'FDOC-LEADING', citationType: 'applied' });
    repo.addCitation({ sourceDocumentId: 'FDOC-3', targetDocumentId: 'FDOC-LEADING', citationType: 'distinguished' });
    repo.addCitation({ sourceDocumentId: 'FDOC-4', targetDocumentId: 'FDOC-LEADING', citationType: 'cites' });

    const t = repo.getTreatment('FDOC-LEADING');
    expect(t.citationCount).toBe(4);
    expect(t.positiveCount).toBe(2);
    expect(t.negativeCount).toBe(1);
    expect(t.neutralCount).toBe(1);
    expect(t.overruled).toBe(false);
    expect(t.byType.followed).toBe(1);
  });

  it('is idempotent on (source, target, type)', () => {
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-X', citationType: 'followed' });
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-X', citationType: 'followed' });
    expect(repo.count()).toBe(1);
    expect(repo.getTreatment('FDOC-X').citationCount).toBe(1);
  });

  it('ranks a frequently-followed precedent above an isolated one of equal similarity', () => {
    // Leading precedent: followed by many.
    for (let i = 0; i < 10; i++) {
      repo.addCitation({ sourceDocumentId: `FDOC-c${i}`, targetDocumentId: 'FDOC-LEADING', citationType: 'followed' });
    }
    // Isolated precedent: a single neutral citation.
    repo.addCitation({ sourceDocumentId: 'FDOC-z', targetDocumentId: 'FDOC-ISOLATED', citationType: 'cites' });

    const leading  = repo.getTreatment('FDOC-LEADING').authorityScore;
    const isolated = repo.getTreatment('FDOC-ISOLATED').authorityScore;
    expect(leading).toBeGreaterThan(isolated);
  });

  it('demotes an overruled precedent below an isolated neutral one', () => {
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-DEAD', citationType: 'followed' });
    repo.addCitation({ sourceDocumentId: 'FDOC-2', targetDocumentId: 'FDOC-DEAD', citationType: 'overruled' });
    repo.addCitation({ sourceDocumentId: 'FDOC-9', targetDocumentId: 'FDOC-ALIVE', citationType: 'cites' });

    const dead  = repo.getTreatment('FDOC-DEAD');
    const alive = repo.getTreatment('FDOC-ALIVE').authorityScore;
    expect(dead.overruled).toBe(true);
    expect(dead.authorityScore).toBeLessThan(alive);
  });

  it('getTreatmentBatch returns a map and omits documents with no edges', () => {
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-A', citationType: 'followed' });
    const map = repo.getTreatmentBatch(['FDOC-A', 'FDOC-NONE']);
    expect(map.get('FDOC-A')?.citationCount).toBe(1);
    expect(map.has('FDOC-NONE')).toBe(false);
  });

  it('lists citing documents for a target', () => {
    repo.addCitation({ sourceDocumentId: 'FDOC-1', targetDocumentId: 'FDOC-A', citationType: 'followed' });
    repo.addCitation({ sourceDocumentId: 'FDOC-2', targetDocumentId: 'FDOC-A', citationType: 'distinguished' });
    const citing = repo.getCitingDocuments('FDOC-A');
    expect(citing).toHaveLength(2);
    expect(citing.map((c) => c.sourceDocumentId).sort()).toEqual(['FDOC-1', 'FDOC-2']);
  });

  it('computeAuthorityScore is a pure, deterministic function', () => {
    const a = computeAuthorityScore({ citationCount: 10, positiveCount: 10, negativeCount: 0, overruled: false });
    const b = computeAuthorityScore({ citationCount: 1, positiveCount: 0, negativeCount: 0, overruled: false });
    const overruled = computeAuthorityScore({ citationCount: 5, positiveCount: 5, negativeCount: 1, overruled: true });
    expect(a).toBeGreaterThan(b);
    expect(overruled).toBeLessThan(b);
  });
});
