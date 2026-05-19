import { describe, it, expect } from 'vitest';
import { canonicalizeProcedure, canonicalizeCitation } from '@legal-os/citation-engine';

describe('canonicalizeProcedure', () => {
  it('keeps canonical form unchanged', () => {
    expect(canonicalizeProcedure('רע"א')).toBe('רע"א');
    expect(canonicalizeProcedure('בג"ץ')).toBe('בג"ץ');
  });
  it('repairs un-quoted OCR form', () => {
    expect(canonicalizeProcedure('רעא')).toBe('רע"א');
    expect(canonicalizeProcedure('עא')).toBe('ע"א');
    expect(canonicalizeProcedure('בגץ')).toBe('בג"ץ');
    expect(canonicalizeProcedure('עפ')).toBe('ע"פ');
  });
  it('repairs gershayim variant', () => {
    expect(canonicalizeProcedure('ע״א')).toBe('ע"א');
    expect(canonicalizeProcedure('בג״ץ')).toBe('בג"ץ');
  });
  it('returns unknown procedure unchanged', () => {
    expect(canonicalizeProcedure('xyz')).toBe('xyz');
  });
});

describe('canonicalizeCitation', () => {
  it('normalizes OCR-corrupted procedure', () => {
    const result = canonicalizeCitation('רעא 1234/21 כהן נגד לוי');
    expect(result.startsWith('רע"א')).toBe(true);
  });
  it('normalizes case number separator', () => {
    const result = canonicalizeCitation('ע"א 1234-21 כהן נגד לוי');
    expect(result).toContain('1234/21');
  });
  it('normalizes parties separator', () => {
    const result = canonicalizeCitation('ע"א 1234/21 כהן נגד לוי');
    expect(result).toContain("נ'");
    expect(result).not.toContain('נגד');
  });
  it('is idempotent — running twice gives the same result', () => {
    const input  = 'רעא 1234-21 כהן נגד מדינת ישראל';
    const once   = canonicalizeCitation(input);
    const twice  = canonicalizeCitation(once);
    expect(once).toBe(twice);
  });
});
