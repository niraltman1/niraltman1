import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { DocumentRepository } from './documents.js';

// Minimal slice of the real schema (migrations 015 + 037) needed for insight edits.
const SCHEMA = `
CREATE TABLE Documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_hash TEXT, original_path TEXT, storage_path TEXT, filename TEXT,
  extension TEXT, file_size_bytes INTEGER, processing_state TEXT, created_at TEXT
);
CREATE TABLE DocumentInsights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  case_number TEXT, court_name TEXT, judge_name TEXT, offense_type TEXT,
  next_hearing TEXT, charges TEXT, remedies TEXT,
  confidence REAL DEFAULT 0.0, model_used TEXT,
  extracted_at TEXT, raw_response TEXT,
  verification_state TEXT NOT NULL DEFAULT 'unverified'
);
`;

describe('DocumentRepository — insight inline edit (§4.2.1)', () => {
  let db: DatabaseConnection;
  let repo: DocumentRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    db.prepare('INSERT INTO Documents (id, filename) VALUES (1, ?)').run('a.pdf');
    db.prepare(
      `INSERT INTO DocumentInsights (id, document_id, case_number, court_name, judge_name, confidence)
       VALUES (1, 1, ?, ?, ?, 0.5)`,
    ).run('ת"פ-2023-005', 'שלום ת"א', 'לוי');
    repo = new DocumentRepository(db);
  });

  afterEach(() => db.close());

  it('finds an insight by its own id', () => {
    const insight = repo.findInsightById(1);
    expect(insight).not.toBeNull();
    expect(insight!['judge_name']).toBe('לוי');
  });

  it('updates only the provided fields, leaving others untouched', () => {
    const changed = repo.updateInsightFields(1, { judgeName: 'כהן' });
    expect(changed).toBe(1);
    const after = repo.findInsightById(1)!;
    expect(after['judge_name']).toBe('כהן');
    expect(after['court_name']).toBe('שלום ת"א'); // untouched
  });

  it('can clear a field by passing null', () => {
    repo.updateInsightFields(1, { courtName: null });
    expect(repo.findInsightById(1)!['court_name']).toBeNull();
  });

  it('updates several fields at once', () => {
    repo.updateInsightFields(1, { caseNumber: 'תא-2024-042', offenseType: 'הפרת חוזה' });
    const after = repo.findInsightById(1)!;
    expect(after['case_number']).toBe('תא-2024-042');
    expect(after['offense_type']).toBe('הפרת חוזה');
  });

  it('is a no-op (0 changes) when no editable fields are given', () => {
    expect(repo.updateInsightFields(1, {})).toBe(0);
  });

  it('does not affect verification_state', () => {
    repo.updateInsightFields(1, { judgeName: 'כהן' });
    expect(repo.findInsightById(1)!['verification_state']).toBe('unverified');
  });
});
