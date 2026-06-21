import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseConnection } from '../connection.js';
import { CorpusAuditRepository, LAWS_TARGET, VERDICTS_TARGET } from './corpus-audit.js';

// Minimal subset of the legal-brain schema. The audit is defensive: tables that
// are absent here (verdicts, vec_*) must contribute 0 rather than throw.
const SCHEMA = `
CREATE TABLE LegalSources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, title_he TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'statute', is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE LegalSections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL,
  section_label TEXT NOT NULL, verbatim_text_he TEXT NOT NULL, char_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE LegalSectionEmbeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL UNIQUE, source_id INTEGER NOT NULL,
  embedding TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'nomic-embed-text'
);
CREATE TABLE LegalCitationGraph (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_document_id TEXT NOT NULL,
  target_document_id TEXT NOT NULL, citation_type TEXT NOT NULL DEFAULT 'cites'
);
`;

describe('CorpusAuditRepository', () => {
  let db: DatabaseConnection;
  let repo: CorpusAuditRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new CorpusAuditRepository(db);
  });
  afterEach(() => db.close());

  it('returns zeroed-but-valid report on an empty corpus and exposes base targets', () => {
    const r = repo.audit();
    expect(r.laws.sources).toBe(0);
    expect(r.laws.target).toBe(LAWS_TARGET);
    expect(r.verdicts.target).toBe(VERDICTS_TARGET);
    expect(r.rawText.totalChars).toBe(0);
    expect(r.embeddings.dim).toBe(768);
    expect(r.embeddings.model).toBe('nomic-embed-text');
    // Verdict tables are absent — defensively counted as 0, not a throw.
    expect(r.verdicts.supremeCourt).toBe(0);
  });

  it('counts laws, raw-text volume and embedded-vs-FTS coverage', () => {
    db.exec(`
      INSERT INTO LegalSources (source_key, title_he) VALUES ('law_a', 'חוק א');
      INSERT INTO LegalSections (source_id, section_label, verbatim_text_he, char_count)
        VALUES (1, 'סעיף 1', 'טקסט', 100), (1, 'סעיף 2', 'טקסט', 150);
      INSERT INTO LegalSectionEmbeddings (section_id, source_id, embedding) VALUES (1, 1, '[0.1,0.2]');
    `);
    const r = repo.audit();
    expect(r.laws.sources).toBe(1);
    expect(r.laws.sections).toBe(2);
    expect(r.laws.sectionsEmbedded).toBe(1);
    expect(r.laws.sectionsFtsOnly).toBe(1);
    expect(r.rawText.totalChars).toBe(250);
    expect(r.rawText.estimatedTokens).toBe(Math.round(250 / 2.5));
    // estimatedMB uses 2-dp rounding (sized for GB-scale corpora), so 250 chars → 0.
    expect(r.rawText.estimatedMB).toBe(0);
  });

  it('flags the JS-cosine bottleneck when sections are embedded but vec_legal_sections is absent', () => {
    db.exec(`
      INSERT INTO LegalSources (source_key, title_he) VALUES ('law_a', 'חוק א');
      INSERT INTO LegalSections (source_id, section_label, verbatim_text_he, char_count) VALUES (1, 'סעיף 1', 'טקסט', 10);
      INSERT INTO LegalSectionEmbeddings (section_id, source_id, embedding) VALUES (1, 1, '[0.1]');
    `);
    const r = repo.audit();
    const vecSections = r.embeddings.vectorTables.find((t) => t.name === 'vec_legal_sections');
    expect(vecSections?.available).toBe(false);
    expect(r.bottlenecks.some((b) => b.includes('vec_legal_sections'))).toBe(true);
  });

  it('reports citation-graph edge count', () => {
    db.exec(`INSERT INTO LegalCitationGraph (source_document_id, target_document_id, citation_type)
             VALUES ('FDOC-1','FDOC-2','followed');`);
    expect(repo.audit().embeddings.citationGraphEdges).toBe(1);
  });
});
