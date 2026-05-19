import { describe, it, expect } from 'vitest';
import { SearchEngine } from '../../packages/database/src/search/engine.js';

// Test only the pure utility methods that don't require a real DB
describe('SearchEngine.normaliseHebrew', () => {
  // We access the private method through a cast for unit testing
  type SE = { normaliseHebrew(text: string): string };

  function normalise(text: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (SearchEngine.prototype as any).normaliseHebrew.call({}, text) as string;
  }

  it('strips nikud (vowel diacritics U+05B0–U+05C7)', () => {
    // שָׁלוֹם → שלום
    const input    = 'שָׁלוֹם';
    const expected = 'שלום';
    expect(normalise(input)).toBe(expected);
  });

  it('strips geresh (U+05F3)', () => {
    const input = "כ׳";
    expect(normalise(input)).toBe('כ');
  });

  it('strips gershayim (U+05F4)', () => {
    const input = "ד״ר";
    expect(normalise(input)).toBe('דר');
  });

  it('lowercases Latin characters', () => {
    expect(normalise('Hello World')).toBe('hello world');
  });

  it('trims surrounding whitespace', () => {
    expect(normalise('  שלום  ')).toBe('שלום');
  });

  it('handles empty string', () => {
    expect(normalise('')).toBe('');
  });

  it('handles mixed Hebrew-English text', () => {
    const result = normalise('חוזה Contract');
    expect(result).toBe('חוזה contract');
  });
});

describe('SearchEngine.buildFTSQuery', () => {
  function buildFTS(text: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (SearchEngine.prototype as any).buildFTSQuery.call({
      normaliseHebrew: (t: string) => t.toLowerCase().trim(),
    }, text) as string;
  }

  it('wraps each token with prefix wildcard', () => {
    const result = buildFTS('חוזה עבודה');
    expect(result).toBe('"חוזה"* "עבודה"*');
  });

  it('handles single word', () => {
    const result = buildFTS('פסיקה');
    expect(result).toBe('"פסיקה"*');
  });

  it('ignores empty tokens from extra spaces', () => {
    const result = buildFTS('  שלום   עולם  ');
    expect(result).toBe('"שלום"* "עולם"*');
  });
});
