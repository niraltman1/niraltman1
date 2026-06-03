import { describe, it, expect, vi } from 'vitest';
import { searchLegalSections } from './legal-section-search.js';

// Stub embedder so tests never hit Ollama
vi.mock('./embedder.js', () => ({
  embed:             vi.fn().mockResolvedValue(null),
  cosineSimilarity:  vi.fn().mockReturnValue(0),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function sectionRow(overrides: Partial<{
  id: number; source_id: number; source_key: string; title_he: string;
  section_label: string; heading_he: string | null; verbatim_text_he: string;
}> = {}) {
  return {
    id: 1, source_id: 10, source_key: 'il_law_999', title_he: 'חוק לדוגמה',
    section_label: 'סעיף 1', heading_he: 'כותרת', verbatim_text_he: 'טקסט הסעיף',
    ...overrides,
  };
}

function makeDb(opts: {
  ftsRows?:   unknown[];
  embedRows?: unknown[];
  throwFts?:  boolean;
} = {}) {
  return {
    prepare: (sql: string) => ({
      all: vi.fn().mockImplementation((..._args: unknown[]) => {
        if (opts.throwFts && sql.includes('fts_legal_sections')) throw new Error('no such table');
        if (sql.includes('fts_legal_sections')) return opts.ftsRows ?? [];
        if (sql.includes('LegalSectionEmbeddings')) return opts.embedRows ?? [];
        return [];
      }),
    }),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('searchLegalSections — FTS path', () => {
  it('returns correct LegalSectionResult shape from FTS rows', async () => {
    const db = makeDb({ ftsRows: [sectionRow()] });
    const results = await searchLegalSections('test', db);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sectionId:    1,
      sourceId:     10,
      sourceKey:    'il_law_999',
      titleHe:      'חוק לדוגמה',
      sectionLabel: 'סעיף 1',
      headingHe:    'כותרת',
      verbatimText: 'טקסט הסעיף',
      source:       'fts',
    });
    expect(typeof results[0]!.score).toBe('number');
  });

  it('sourceKey filter is passed to the SQL (single-source queries)', async () => {
    const r1 = sectionRow({ id: 1, source_key: 'il_law_1' });
    // Only r1 returned when sourceKey matches (r2 belongs to a different law)
    const db = makeDb({ ftsRows: [r1] });
    const results = await searchLegalSections('query', db, { sourceKey: 'il_law_1' });
    expect(results).toHaveLength(1);
    expect(results[0]!.sourceKey).toBe('il_law_1');
    // Ensure r2 not present
    expect(results.find(r => r.sourceKey === 'il_law_2')).toBeUndefined();
  });

  it('returns empty array when FTS table does not exist (graceful degradation)', async () => {
    const db = makeDb({ throwFts: true });
    const results = await searchLegalSections('query', db);
    expect(results).toEqual([]);
  });
});

describe('searchLegalSections — vector path', () => {
  it('returns results from embeddings when embed() returns a vector', async () => {
    const { embed } = await import('./embedder.js');
    vi.mocked(embed).mockResolvedValueOnce([0.1, 0.2, 0.3]);
    const { cosineSimilarity } = await import('./embedder.js');
    vi.mocked(cosineSimilarity).mockReturnValue(0.85); // above 0.3 threshold

    const embedRow = { section_id: 5, embedding: '[0.1,0.2,0.3]',
      id: 5, source_id: 20, source_key: 'il_law_77', title_he: 'חוק ב',
      section_label: 'סעיף 5', heading_he: null, verbatim_text_he: 'טקסט' };
    const db = makeDb({ embedRows: [embedRow] });

    const results = await searchLegalSections('search', db);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.source).toBe('vector');
  });
});

describe('searchLegalSections — RRF fusion', () => {
  it('marks source as "hybrid" when same section appears in both FTS and vector results', async () => {
    const { embed } = await import('./embedder.js');
    vi.mocked(embed).mockResolvedValueOnce([0.5, 0.5]);
    const { cosineSimilarity } = await import('./embedder.js');
    vi.mocked(cosineSimilarity).mockReturnValue(0.9);

    const row = sectionRow({ id: 42 });
    const embedRow = { section_id: 42, embedding: '[0.5,0.5]', ...row };
    const db = makeDb({ ftsRows: [row], embedRows: [embedRow] });

    const results = await searchLegalSections('query', db);
    const hit = results.find(r => r.sectionId === 42);
    expect(hit).toBeDefined();
    expect(hit!.source).toBe('hybrid');
  });
});
