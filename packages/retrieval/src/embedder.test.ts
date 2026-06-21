import { describe, it, expect } from 'vitest';
import { mockEmbed, cosineSimilarity, EMBED_DIM } from './embedder.js';

describe('mockEmbed', () => {
  it('returns a vector of EMBED_DIM (768) length', () => {
    expect(mockEmbed('שלום עולם')).toHaveLength(EMBED_DIM);
  });

  it('is deterministic — identical text yields the identical vector', () => {
    expect(mockEmbed('פסק דין לדוגמה')).toEqual(mockEmbed('פסק דין לדוגמה'));
  });

  it('produces different vectors for different text', () => {
    const a = mockEmbed('חוק החוזים');
    const b = mockEmbed('חוק העונשין');
    expect(a).not.toEqual(b);
    // Distinct unrelated text should not be near-identical.
    expect(cosineSimilarity(a, b)).toBeLessThan(0.99);
  });

  it('is unit-normalized (‖v‖ ≈ 1)', () => {
    const v = mockEmbed('בדיקת נורמליזציה');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('self-similarity is 1', () => {
    const v = mockEmbed('עליון מחוזי שלום');
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('handles empty string without NaN', () => {
    const v = mockEmbed('');
    expect(v).toHaveLength(EMBED_DIM);
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('respects a custom dimension', () => {
    expect(mockEmbed('x', 16)).toHaveLength(16);
  });
});
