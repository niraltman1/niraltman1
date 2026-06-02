import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseConnection, LegalCorpusRepository } from '@factum-il/database';
import type { Repos } from '../db.js';
import { initLegalCorpus, _resetLegalCorpusLoadGuard } from './legal-corpus-loader.js';

// Inline mirror of migrations/061_legal_corpus.sql (self-contained, like the DB repo test).
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
CREATE TRIGGER trg_legal_sections_au AFTER UPDATE ON LegalSections BEGIN
  INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he) VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
  INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he) VALUES (new.id, new.heading_he, new.verbatim_text_he);
END;
`;

const INGESTED = JSON.stringify({
  schemaVersion: 1, sourceKey: 'il_law_2000479', israelLawId: 2000479,
  titleHe: 'חוק העונשין, התשל"ז–1977', shortName: 'חוק העונשין', sourceType: 'statute',
  year: 1977, sourceUrl: 'https://he.wikisource.org/wiki/חוק_העונשין', lastUpdated: '2026-01-01',
  status: 'ingested', magarId: 2000479, contentHash: 'abc',
  sections: [
    { sectionLabel: 'סעיף 1', verbatimText: 'הגדרות.', orderIndex: 0 },
    { sectionLabel: 'סעיף 2', verbatimText: 'עבירה היא מעשה האסור.', orderIndex: 1 },
  ],
  embeddings: [{ orderIndex: 0, model: 'nomic-embed-text', vector: [0.1, 0.2, 0.3] }],
});
const METADATA_ONLY = JSON.stringify({
  schemaVersion: 1, sourceKey: 'il_law_999', israelLawId: 999, titleHe: 'חוק ללא טקסט',
  shortName: 'חוק ללא טקסט', sourceType: 'statute', year: null, sourceUrl: null, lastUpdated: null,
  status: 'metadata_only', magarId: null, contentHash: null, sections: [], embeddings: [],
});

describe('initLegalCorpus', () => {
  let db: DatabaseConnection;
  let repos: Repos;
  let dir: string;

  beforeEach(() => {
    _resetLegalCorpusLoadGuard();
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repos = { db, legalCorpus: new LegalCorpusRepository(db) } as unknown as Repos;
    dir = mkdtempSync(join(tmpdir(), 'corpus-'));
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  function writeArtifact(...lines: string[]): string {
    const p = join(dir, 'legal-corpus.knesset.jsonl');
    writeFileSync(p, `${lines.join('\n')}\n`, 'utf-8');
    return p;
  }

  it('imports an ingested law (sections + embedding) and a metadata-only law, skipping malformed lines', async () => {
    const path = writeArtifact(INGESTED, '{ this is not json', METADATA_ONLY);
    await initLegalCorpus(repos, path);
    const stats = repos.legalCorpus.stats();
    expect(stats.sources).toBe(2);        // both laws as registry rows
    expect(stats.sections).toBe(2);       // only the ingested law has sections
    expect(stats.embedded).toBe(1);       // one section had a vector
    expect(repos.legalCorpus.getSourceByKey('il_law_999')?.sectionCount).toBe(0); // metadata-only
  });

  it('is idempotent — loading the same artifact twice yields identical stats (no duplication)', async () => {
    const path = writeArtifact(INGESTED, METADATA_ONLY);
    await initLegalCorpus(repos, path);
    const first = repos.legalCorpus.stats();
    _resetLegalCorpusLoadGuard();
    await initLegalCorpus(repos, path);
    expect(repos.legalCorpus.stats()).toEqual(first);
  });

  it('is graceful when the artifact is absent (no throw, corpus stays empty)', async () => {
    await expect(initLegalCorpus(repos, join(dir, 'does-not-exist.jsonl'))).resolves.toBeUndefined();
    expect(repos.legalCorpus.stats().sources).toBe(0);
  });
});
