/**
 * Tests for LegalDocumentRepository — canonical legal document model.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { DatabaseConnection } from '../connection.js';
import { LegalDocumentRepository } from './legal-documents.js';
import { LegalSourceRegistryRepository } from './legal-source-registry.js';

// Minimal schema for tests — only the tables we need
const SCHEMA = `
CREATE TABLE IF NOT EXISTS LegalDocumentIdSeq (id INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE IF NOT EXISTS LegalSourceRegistry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL UNIQUE, source_name TEXT NOT NULL,
  source_version TEXT, source_license TEXT, source_type TEXT NOT NULL DEFAULT 'CASE_LAW',
  update_strategy TEXT NOT NULL DEFAULT 'REPLACE', ingestion_adapter TEXT NOT NULL DEFAULT 'test',
  description TEXT, home_url TEXT, is_active INTEGER NOT NULL DEFAULT 1,
  last_ingested_at TEXT, document_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS LegalDocuments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE, source_id INTEGER NOT NULL,
  source_type TEXT NOT NULL, source_dataset TEXT NOT NULL, source_version TEXT,
  document_type TEXT NOT NULL, proceeding_type TEXT, court TEXT, case_number TEXT,
  title TEXT, date TEXT, year INTEGER,
  judges_json TEXT NOT NULL DEFAULT '[]', parties_json TEXT NOT NULL DEFAULT '[]',
  lawyers_json TEXT NOT NULL DEFAULT '[]',
  text TEXT NOT NULL, char_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}', visibility_scope TEXT NOT NULL DEFAULT 'PUBLIC',
  canonical_case_key TEXT, duplicate_of_id INTEGER, duplicate_count INTEGER NOT NULL DEFAULT 0,
  external_id TEXT, content_hash TEXT, is_active INTEGER NOT NULL DEFAULT 1,
  indexed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS fts_legal_documents USING fts5(
  title, case_number, court, text,
  content='LegalDocuments', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS trg_legal_docs_ai AFTER INSERT ON LegalDocuments BEGIN
  INSERT INTO fts_legal_documents(rowid, title, case_number, court, text)
  VALUES (new.id, new.title, new.case_number, new.court, new.text);
END;
CREATE TABLE IF NOT EXISTS LegalDocumentEmbeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, document_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL DEFAULT 'nomic-embed-text', embedding TEXT NOT NULL,
  dim INTEGER NOT NULL DEFAULT 768,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS VerdictCitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_document_id TEXT NOT NULL,
  cited_document_id TEXT, citation_text TEXT NOT NULL, citation_type TEXT,
  citation_normalized TEXT, confidence REAL, context_snippet TEXT,
  is_self_cite INTEGER NOT NULL DEFAULT 0, is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

function buildDb(): DatabaseConnection {
  const db = new DatabaseConnection({ path: ':memory:' });
  db.exec(SCHEMA);
  return db;
}

function seedSource(db: DatabaseConnection): number {
  const reg = new LegalSourceRegistryRepository(db);
  const src = reg.upsert({
    sourceId: 'test/source', sourceName: 'Test Source',
    sourceType: 'CASE_LAW', ingestionAdapter: 'TestAdapter',
  });
  return src.id;
}

describe('LegalDocumentRepository', () => {
  let db: DatabaseConnection;
  let repo: LegalDocumentRepository;
  let sourceId: number;

  beforeEach(() => {
    db       = buildDb();
    repo     = new LegalDocumentRepository(db);
    sourceId = seedSource(db);
  });

  afterEach(() => {
    db.close();
  });

  it('inserts a document and returns a stable FDOC ID', () => {
    const docId = repo.insert({
      sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source',
      documentType: 'VERDICT', text: 'This is a test Israeli court ruling with enough text for validation.',
      court: 'בית המשפט העליון',
    });
    expect(docId).toMatch(/^FDOC-\d{8}$/);
  });

  it('FDOC IDs increment monotonically', () => {
    const id1 = repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'First document text that is long enough for the test case.' });
    const id2 = repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'Second document text that is long enough for the test case.' });
    const n1 = parseInt(id1.replace('FDOC-', ''), 10);
    const n2 = parseInt(id2.replace('FDOC-', ''), 10);
    expect(n2).toBeGreaterThan(n1);
  });

  it('retrieves a document by FDOC ID', () => {
    const docId = repo.insert({
      sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source',
      documentType: 'VERDICT', text: 'Verbatim court ruling text for retrieval test.',
      court: 'בית משפט שלום', caseNumber: 'ת"א-2024-001',
      judges: ['השופט יוסף כהן'], parties: ['תובע א', 'נתבע ב'],
    });

    const doc = repo.getByDocumentId(docId);
    expect(doc).not.toBeNull();
    expect(doc!.documentId).toBe(docId);
    expect(doc!.court).toBe('בית משפט שלום');
    expect(doc!.judges).toEqual(['השופט יוסף כהן']);
    expect(doc!.parties).toEqual(['תובע א', 'נתבע ב']);
    expect(doc!.isActive).toBe(true);
  });

  it('finds document by content hash for deduplication', () => {
    const text = 'Unique verbatim court ruling text that identifies this specific document.';
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text });

    const hash = createHash('sha256').update(text).digest('hex');
    const found = repo.findByContentHash(hash);
    expect(found).not.toBeNull();
    expect(found!.text).toBe(text);
  });

  it('returns null for non-existent content hash', () => {
    const found = repo.findByContentHash('deadbeef'.repeat(8));
    expect(found).toBeNull();
  });

  it('returns null for non-existent document ID', () => {
    const doc = repo.getByDocumentId('FDOC-99999999');
    expect(doc).toBeNull();
  });

  it('lists recent documents', () => {
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'First document for listing test purposes.', date: '2024-01-01' });
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'Second document for listing test purposes.', date: '2024-02-01' });

    const docs = repo.listRecent({ limit: 10 });
    expect(docs.length).toBe(2);
  });

  it('returns correct stats', () => {
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'Document for stats test with public visibility.' });
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'DECISION', text: 'Another document for stats test.', visibilityScope: 'PRIVATE' });

    const stats = repo.stats();
    expect(stats.total).toBe(2);
    expect(stats.publicCount).toBe(1);
    expect(stats.byDocumentType.length).toBeGreaterThan(0);
  });

  it('deactivates all documents for a source', () => {
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'Document to deactivate.' });
    repo.insert({ sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source', documentType: 'VERDICT', text: 'Another document to deactivate.' });

    const changed = repo.deactivateBySource('test/source');
    expect(changed).toBe(2);

    const stats = repo.stats();
    expect(stats.total).toBe(0); // no active docs
  });

  it('marks a document as indexed', () => {
    const docId = repo.insert({
      sourceId, sourceType: 'CASE_LAW', sourceDataset: 'test/source',
      documentType: 'VERDICT', text: 'Document to mark as indexed.',
    });
    repo.markIndexed(docId);
    const doc = repo.getByDocumentId(docId);
    expect(doc!.isActive).toBe(true); // still active after indexing
  });
});
