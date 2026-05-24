import { describe, it, expect } from 'vitest';
import { SearchEngine } from '../../packages/database/src/search/engine.js';

// Test only the pure utility methods
describe('SearchEngine Phase 3 — buildFTSQuery with prefix normalization', () => {
  const engine = new SearchEngine(null as never);

  it('strips conjunctive prefix ו from search token', () => {
    const q = engine.buildFTSQuery('וחוזה');
    expect(q).toContain('"חוזה"*');
  });

  it('strips preposition ב', () => {
    const q = engine.buildFTSQuery('בית');
    // "בית" itself has no legal synonym so should appear as-is + stripped ית
    // The token "בית" starts with ב, stripped = "ית" (2 chars) — should add variant
    expect(q).toContain('"בית"*');
  });

  it('strips preposition ל', () => {
    const q = engine.buildFTSQuery('לחוזה');
    expect(q).toContain('"חוזה"*');
  });

  it('strips compound prefix של', () => {
    const q = engine.buildFTSQuery('שלחוזה');
    expect(q).toContain('"חוזה"*');
  });

  it('expands legal synonyms for חוזה', () => {
    const q = engine.buildFTSQuery('חוזה');
    expect(q).toContain('"הסכם"*');
    expect(q).toContain('"עסקה"*');
  });

  it('expands legal synonyms for הסכם', () => {
    const q = engine.buildFTSQuery('הסכם');
    expect(q).toContain('"חוזה"*');
  });

  it('expands פסיקה to include פסק and דין', () => {
    const q = engine.buildFTSQuery('פסיקה');
    expect(q).toContain('"פסק"*');
    expect(q).toContain('"דין"*');
  });

  it('handles multi-word query — each token is independently expanded', () => {
    const q = engine.buildFTSQuery('חוזה שכירות');
    expect(q).toContain('"הסכם"*');
    expect(q).toContain('"חכירה"*');
  });

  it('skips stripping when result would be too short (< 2 chars)', () => {
    // Single-char word after stripping should keep original
    const q = engine.buildFTSQuery('בא');
    // "בא" stripped would be "א" (1 char) — should not add that variant
    expect(q).not.toContain('"א"*');
    expect(q).toContain('"בא"*');
  });

  it('adds definite article variant ה for bare stems', () => {
    // "עבודה" → should also include "העבודה"
    const q = engine.buildFTSQuery('עבודה');
    expect(q).toContain('"עבודה"*');
    expect(q).toContain('"העבודה"*');
  });

  it('does not duplicate ה variant when token already starts with ה', () => {
    // "הסכם" already starts with ה — should not add "ההסכם"
    const q = engine.buildFTSQuery('הסכם');
    expect(q).not.toContain('"ההסכם"*');
  });
});

describe('SearchEngine Phase 3 — normaliseHebrew', () => {
  const engine = new SearchEngine(null as never);

  it('strips full nikud block correctly', () => {
    // מִשְׁפָּט (judgment with vowels) → משפט
    expect(engine.normaliseHebrew('מִשְׁפָּט')).toBe('משפט');
  });

  it('lowercases mixed Hebrew-English', () => {
    expect(engine.normaliseHebrew('הסכם Contract')).toBe('הסכם contract');
  });

  it('collapses multiple spaces', () => {
    expect(engine.normaliseHebrew('א    ב')).toBe('א ב');
  });

  it('handles empty string', () => {
    expect(engine.normaliseHebrew('')).toBe('');
  });
});
