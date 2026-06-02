import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { LegalCorpusRepository } from './legal-corpus.js';

// Mirrors migrations/061_legal_corpus.sql (kept inline so the test is self-contained).
const SCHEMA = `
CREATE TABLE LegalSources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, title_he TEXT NOT NULL,
  short_name TEXT, citation TEXT, source_type TEXT NOT NULL DEFAULT 'statute',
  procedure_domain TEXT, source_url TEXT, year INTEGER, content_hash TEXT,
  section_count INTEGER NOT NULL DEFAULT 0, fetched_at TEXT, is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE LegalSections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
  section_label TEXT NOT NULL, heading_he TEXT, verbatim_text_he TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0, parent_label TEXT, char_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_id, section_label)
);
CREATE INDEX idx_legal_sections_source ON LegalSections(source_id, order_index);
CREATE TABLE LegalSectionEmbeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL UNIQUE REFERENCES LegalSections(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
  embedding TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'nomic-embed-text',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE VIRTUAL TABLE fts_legal_sections USING fts5(
  heading_he, verbatim_text_he, content='LegalSections', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER trg_legal_sections_ai AFTER INSERT ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he) VALUES (new.id, new.heading_he, new.verbatim_text_he);
END;
CREATE TRIGGER trg_legal_sections_ad AFTER DELETE ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he) VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
END;
`;

describe('LegalCorpusRepository', () => {
  let db: DatabaseConnection;
  let repo: LegalCorpusRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new LegalCorpusRepository(db);
  });
  afterEach(() => db.close());

  function seedTwoLaws() {
    const a = repo.upsertSource({ sourceKey: 'law_a', titleHe: 'חוק א', sourceType: 'statute', procedureDomain: 'criminal' });
    const b = repo.upsertSource({ sourceKey: 'law_b', titleHe: 'חוק ב', sourceType: 'regulation', procedureDomain: 'civil' });
    repo.replaceSections(a, [
      { sectionLabel: 'סעיף 1', verbatimText: 'טקסט מדויק של חוק א סעיף 1', orderIndex: 0 },
      { sectionLabel: 'סעיף 2', verbatimText: 'טקסט מדויק של חוק א סעיף 2', orderIndex: 1 },
    ]);
    repo.replaceSections(b, [
      { sectionLabel: 'סעיף 1', verbatimText: 'טקסט מדויק של חוק ב סעיף 1', orderIndex: 0 },
    ]);
    return { a, b };
  }

  it('keeps each law isolated — same label across laws does not collide', () => {
    seedTwoLaws();
    const stats = repo.stats();
    expect(stats.sources).toBe(2);
    expect(stats.sections).toBe(3);
    const aSecs = repo.getSections(repo.getSourceByKey('law_a')!.id);
    expect(aSecs.every((s) => s.verbatimText.includes('חוק א'))).toBe(true);
    expect(aSecs.some((s) => s.verbatimText.includes('חוק ב'))).toBe(false);
  });

  it('replaceSections is atomic per-source and idempotent (re-replace does not touch others)', () => {
    const { a } = seedTwoLaws();
    repo.replaceSections(a, [{ sectionLabel: 'סעיף 1', verbatimText: 'גרסה מעודכנת', orderIndex: 0 }]);
    expect(repo.getSections(a)).toHaveLength(1);
    // law_b untouched
    expect(repo.getSourceByKey('law_b')!.sectionCount).toBe(1);
    expect(repo.stats().sections).toBe(2);
  });

  it('records a content_hash and section_count on the source', () => {
    const { a } = seedTwoLaws();
    const src = repo.getSourceByKey('law_a')!;
    expect(src.sectionCount).toBe(2);
    expect(src.contentHash).toMatch(/^[a-f0-9]{64}$/);
    void a;
  });

  it('FTS search returns hits tagged with their source, scopable to one law', () => {
    seedTwoLaws();
    const all = repo.searchSections('מדויק');
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.every((h) => typeof h.sourceKey === 'string')).toBe(true);

    const scoped = repo.searchSections('מדויק', { sourceKey: 'law_b' });
    expect(scoped.every((h) => h.sourceKey === 'law_b')).toBe(true);
  });

  it('stores and counts per-section embeddings, cascading on section replace', () => {
    const { a } = seedTwoLaws();
    const secs = repo.getSections(a);
    repo.upsertEmbedding(secs[0]!.id, a, [0.1, 0.2, 0.3]);
    expect(repo.stats().embedded).toBe(1);
    expect(repo.sectionsMissingEmbedding().some((s) => s.id === secs[0]!.id)).toBe(false);
    // Replacing the source's sections cascades away its embeddings.
    repo.replaceSections(a, [{ sectionLabel: 'חדש', verbatimText: 'טקסט חדש', orderIndex: 0 }]);
    expect(repo.stats().embedded).toBe(0);
  });
});
