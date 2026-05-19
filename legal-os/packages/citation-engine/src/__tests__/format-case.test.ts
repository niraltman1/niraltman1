import { describe, it, expect } from 'vitest';
import { formatCitation } from '@legal-os/citation-engine';
import type { CaseCitation } from '@legal-os/citation-engine';

describe('formatCitation — CaseCitation (Nevo 2021)', () => {
  it('formats full case citation with two parties, publication, and date', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'רע"א',
      number: '1234/21',
      parties: ['כהן', 'מדינת ישראל'],
      publication: 'נבו',
      date: '11.3.2021',
    };
    expect(formatCitation(c)).toBe("רע\"א 1234/21 כהן נ' מדינת ישראל (נבו 11.3.2021)");
  });

  it('formats case without publication or date — no parentheses', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'ע"א',
      number: '5678/19',
      parties: ['לוי', 'שמש'],
    };
    expect(formatCitation(c)).toBe("ע\"א 5678/19 לוי נ' שמש");
  });

  it('formats case with פ"ד publication and volume/page', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'בג"ץ',
      number: '1/49',
      parties: ["בז'רנו", 'שר המשטרה'],
      publication: 'פ"ד',
      volume: 'ב',
      page: '80',
    };
    expect(formatCitation(c)).toBe("בג\"ץ 1/49 בז'רנו נ' שר המשטרה (פ\"ד ב 80)");
  });

  it('formats case with single party', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'ת"פ',
      number: '1000/20',
      parties: ['מדינת ישראל'],
    };
    expect(formatCitation(c)).toBe('ת"פ 1000/20 מדינת ישראל');
  });

  it('formats case with no parties', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'ע"פ',
      number: '999/18',
      parties: [],
    };
    expect(formatCitation(c)).toBe('ע"פ 999/18');
  });

  it('is deterministic — same input × 5 = identical output', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'רע"א',
      number: '1234/21',
      parties: ['כהן', 'מדינת ישראל'],
      publication: 'נבו',
      date: '11.3.2021',
    };
    const results = Array.from({ length: 5 }, () => formatCitation(c));
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });
});
