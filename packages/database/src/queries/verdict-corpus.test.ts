import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseConnection } from '../connection.js';
import { VerdictCorpusRepository, type VerdictInput } from './verdict-corpus.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(here, '../../../../migrations/067_verdict_corpus.sql'), 'utf-8');

function sampleVerdict(over: Partial<VerdictInput> = {}): VerdictInput {
  return {
    docKey:        'hash-001',
    caseNumber:    'בג"ץ 5856/03',
    caseName:      'יורם יזדי נ. פרקליטות המדינה',
    court:         'בג"ץ',
    verdictType:   'פסק-דין',
    verdictDate:   '2003-11-23',
    year:          2003,
    judges:        ['דליה דורנר', 'מרים נאור', 'אסתר חיות'],
    parties:       ['יורם יזדי', 'פרקליטות המדינה'],
    lawyers:       ['שי ניצן'],
    verbatimText:  'העתירה נדחית, ואנו מחייבים את העותר לשלם למשיבים הוצאות בסך 5000 ₪.',
    sourceDataset: 'LevMuchnik/SupremeCourtOfIsrael',
    snapshotLabel: '2022',
    sourceLicense: 'openrail',
    ...over,
  };
}

describe('VerdictCorpusRepository (migration 063)', () => {
  let db: DatabaseConnection;
  let repo: VerdictCorpusRepository;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(MIGRATION);
    repo = new VerdictCorpusRepository(db);
  });

  afterEach(() => db.close());

  it('round-trips a verdict, parsing list metadata back into arrays', () => {
    const id = repo.upsertVerdict(sampleVerdict());
    expect(id).toBeGreaterThan(0);

    const row = repo.getByDocKey('hash-001');
    expect(row).not.toBeNull();
    expect(row!.caseNumber).toBe('בג"ץ 5856/03');
    expect(row!.court).toBe('בג"ץ');
    expect(row!.judges).toEqual(['דליה דורנר', 'מרים נאור', 'אסתר חיות']);
    expect(row!.parties).toContain('פרקליטות המדינה');
    expect(row!.snapshotLabel).toBe('2022');
    expect(row!.sourceDataset).toBe('LevMuchnik/SupremeCourtOfIsrael');
    expect(row!.charCount).toBe(sampleVerdict().verbatimText.length);
  });

  it('is idempotent by doc_key — re-ingesting updates in place, never duplicates', () => {
    repo.upsertVerdict(sampleVerdict());
    repo.upsertVerdict(sampleVerdict({ verdictType: 'החלטה' }));
    expect(repo.stats().verdicts).toBe(1);
    expect(repo.getByDocKey('hash-001')!.verdictType).toBe('החלטה');
  });

  it('keyword-searches verbatim Hebrew text and returns a snippet', () => {
    repo.upsertVerdict(sampleVerdict());
    const hits = repo.searchVerdicts('נדחית');
    expect(hits.length).toBe(1);
    expect(hits[0]!.caseNumber).toBe('בג"ץ 5856/03');
    expect(hits[0]!.snippet).toContain('נדחית');
  });

  it('scopes search and listing by court', () => {
    repo.upsertVerdict(sampleVerdict());
    repo.upsertVerdict(sampleVerdict({
      docKey: 'hash-002', court: 'עליון', caseNumber: 'ע"א 5678/22',
      verbatimText: 'הערעור נדחה בזאת.',
    }));
    expect(repo.searchVerdicts('נדחית', { court: 'עליון' })).toHaveLength(0);
    expect(repo.listRecent({ court: 'בג"ץ' })).toHaveLength(1);
    expect(repo.stats().courts).toBe(2);
  });

  it('tracks embeddings and excludes embedded rows from the missing set', () => {
    const id = repo.upsertVerdict(sampleVerdict());
    expect(repo.verdictsMissingEmbedding().map((v) => v.id)).toContain(id);

    repo.upsertEmbedding(id, [0.1, 0.2, 0.3]);
    expect(repo.verdictsMissingEmbedding().map((v) => v.id)).not.toContain(id);
    expect(repo.stats().embedded).toBe(1);
  });
});
