import { describe, it, expect } from 'vitest';
import { splitHighlight, hasMatch } from './highlight.js';

describe('splitHighlight (Milestone 2)', () => {
  it('returns a single non-match segment when term is empty', () => {
    expect(splitHighlight('שלום עולם', '')).toEqual([{ text: 'שלום עולם', match: false }]);
    expect(splitHighlight('abc', '   ')).toEqual([{ text: 'abc', match: false }]);
  });

  it('marks a single match with surrounding context', () => {
    expect(splitHighlight('בית המשפט המחוזי בתל אביב', 'מחוזי')).toEqual([
      { text: 'בית המשפט ה', match: false },
      { text: 'מחוזי', match: true },
      { text: ' בתל אביב', match: false },
    ]);
  });

  it('is case-insensitive and preserves original casing in the segment', () => {
    expect(splitHighlight('Tel Aviv DISTRICT court', 'district')).toEqual([
      { text: 'Tel Aviv ', match: false },
      { text: 'DISTRICT', match: true },
      { text: ' court', match: false },
    ]);
  });

  it('marks every occurrence', () => {
    const segs = splitHighlight('כהן נגד כהן', 'כהן');
    expect(segs.filter((s) => s.match).length).toBe(2);
    expect(segs.map((s) => s.text).join('')).toBe('כהן נגד כהן');
  });

  it('returns the whole text unmatched when term is absent', () => {
    expect(splitHighlight('abc', 'zzz')).toEqual([{ text: 'abc', match: false }]);
  });

  it('preserves the full text (lossless reassembly)', () => {
    const text = 'תיק ת"א-2024-042 בבית המשפט';
    expect(splitHighlight(text, 'ת"א-2024-042').map((s) => s.text).join('')).toBe(text);
  });
});

describe('hasMatch', () => {
  it('detects presence case-insensitively', () => {
    expect(hasMatch('Judge Cohen', 'cohen')).toBe(true);
    expect(hasMatch('Judge Cohen', 'levi')).toBe(false);
    expect(hasMatch('x', '')).toBe(false);
  });
});
