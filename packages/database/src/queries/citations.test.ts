import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CitationsRepository } from './citations.js';

const SCHEMA = `
CREATE TABLE citation_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  citation TEXT NOT NULL, canonical_form TEXT, citation_type TEXT,
  context_snippet TEXT, source_document_id INTEGER, case_id INTEGER,
  resolved_case_law_id INTEGER, status TEXT NOT NULL DEFAULT 'unresolved',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

describe('CitationsRepository.caseCitationIntelligence (M4)', () => {
  let db: DatabaseConnection;
  let repo: CitationsRepository;

  function add(row: Partial<Record<string, unknown>>): void {
    db.prepare(`INSERT INTO citation_registry
      (citation, canonical_form, citation_type, context_snippet, source_document_id, case_id, resolved_case_law_id, status)
      VALUES (@citation, @canonical_form, @citation_type, @context_snippet, @source_document_id, @case_id, @resolved_case_law_id, @status)`)
      .run({
        citation: null, canonical_form: null, citation_type: null, context_snippet: null,
        source_document_id: null, case_id: null, resolved_case_law_id: null, status: 'unresolved',
        ...row,
      });
  }

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new CitationsRepository(db);
    // Case 1: cites authority A twice (two docs) + authority B once.
    add({ citation: 'ע"א 5678/22', canonical_form: 'ca-5678-22', case_id: 1, source_document_id: 10, context_snippet: 'הקשר 1' });
    add({ citation: 'ע"א 5678/22', canonical_form: 'ca-5678-22', case_id: 1, source_document_id: 11, context_snippet: 'הקשר 2', status: 'linked', resolved_case_law_id: 99 });
    add({ citation: 'בג"ץ 6821/93', canonical_form: 'hcj-6821-93', case_id: 1, source_document_id: 10 });
    // Other matters citing authority A (prior firm use).
    add({ citation: 'ע"א 5678/22', canonical_form: 'ca-5678-22', case_id: 2 });
    add({ citation: 'ע"א 5678/22', canonical_form: 'ca-5678-22', case_id: 3 });
  });

  afterEach(() => db.close());

  it('groups by canonical form with in-case frequency, sorted most-cited first', () => {
    const groups = repo.caseCitationIntelligence(1);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe('ca-5678-22');
    expect(groups[0]!.frequency).toBe(2);
    expect(groups[1]!.frequency).toBe(1);
  });

  it('computes prior firm use = distinct OTHER matters citing the authority', () => {
    const a = repo.caseCitationIntelligence(1).find((g) => g.key === 'ca-5678-22')!;
    expect(a.firmUsage).toBe(2); // cases 2 and 3
    const b = repo.caseCitationIntelligence(1).find((g) => g.key === 'hcj-6821-93')!;
    expect(b.firmUsage).toBe(0);
  });

  it('collects locations and promotes a linked status for the group', () => {
    const a = repo.caseCitationIntelligence(1).find((g) => g.key === 'ca-5678-22')!;
    expect(a.locations.map((l) => l.documentId)).toEqual([10, 11]);
    expect(a.status).toBe('linked');
    expect(a.resolvedCaseLawId).toBe(99);
  });

  it('returns empty for a matter with no citations', () => {
    expect(repo.caseCitationIntelligence(999)).toEqual([]);
  });
});
