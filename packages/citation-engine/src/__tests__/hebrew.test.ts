import { describe, it, expect } from 'vitest';
import {
  normalizeWhitespace,
  normalizeHebrew,
  normalizeCaseNumber,
  normalizePartiesSeparator,
  formatDateNevo,
} from '@factum-il/citation-engine';

describe('normalizeWhitespace', () => {
  it('collapses multiple spaces', () => {
    expect(normalizeWhitespace('a  b   c')).toBe('a b c');
  });
  it('trims leading/trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });
  it('handles non-breaking spaces', () => {
    expect(normalizeWhitespace('a b')).toBe('a b');
  });
});

describe('normalizeHebrew', () => {
  it('replaces gershayim with ASCII double-quote', () => {
    expect(normalizeHebrew('ע״א')).toBe('ע"א');
  });
  it('replaces geresh with ASCII apostrophe', () => {
    expect(normalizeHebrew("ת׳פ")).toBe("ת'פ");
  });
  it('converts gershayim to ASCII double-quote after NFC normalization', () => {
    // gershayim ״ (U+05F4) should become " (ASCII double-quote)
    expect(normalizeHebrew('ע״א'.normalize('NFC'))).toBe('ע"א');
  });
});

describe('normalizeCaseNumber', () => {
  it('replaces hyphen separator', () => {
    expect(normalizeCaseNumber('1234-21')).toBe('1234/21');
  });
  it('replaces en-dash separator', () => {
    expect(normalizeCaseNumber('1234–21')).toBe('1234/21');
  });
  it('leaves slash-separated number unchanged', () => {
    expect(normalizeCaseNumber('1234/21')).toBe('1234/21');
  });
  it('handles 4-digit year', () => {
    expect(normalizeCaseNumber('5678-2019')).toBe('5678/2019');
  });
});

describe('normalizePartiesSeparator', () => {
  it('replaces נגד with נ\'', () => {
    expect(normalizePartiesSeparator('כהן נגד מדינת ישראל')).toBe("כהן נ' מדינת ישראל");
  });
  it('handles multiple spaces around נגד', () => {
    expect(normalizePartiesSeparator('כהן  נגד  לוי')).toBe("כהן נ' לוי");
  });
  it('does not modify text without נגד', () => {
    expect(normalizePartiesSeparator("כהן נ' מדינת ישראל")).toBe("כהן נ' מדינת ישראל");
  });
});

describe('formatDateNevo', () => {
  it('converts ISO date to Nevo format', () => {
    expect(formatDateNevo('2021-03-11')).toBe('11.3.2021');
  });
  it('removes leading zeros from day', () => {
    expect(formatDateNevo('2021-01-05')).toBe('5.1.2021');
  });
  it('converts DD/MM/YYYY format', () => {
    expect(formatDateNevo('11/3/2021')).toBe('11.3.2021');
  });
  it('converts DD.MM.YYYY format', () => {
    expect(formatDateNevo('11.03.2021')).toBe('11.3.2021');
  });
  it('returns unknown format unchanged', () => {
    expect(formatDateNevo('unknown')).toBe('unknown');
  });
});
