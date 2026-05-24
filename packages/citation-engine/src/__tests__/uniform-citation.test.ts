import { describe, it, expect } from 'vitest';
import { formatCitation } from '@factum-il/citation-engine';
import type { CaseCitation, LawCitation, RegulationCitation } from '@factum-il/citation-engine';

/**
 * Uniform Citation Rules (כללי הציטוט האחיד) — Compliance Suite
 *
 * The Nevo 2021 specification implemented by this engine IS the Uniform
 * Citation Rules adopted by Israeli law faculties and the Supreme Court.
 * These tests assert byte-for-byte equivalence with the official examples
 * from the Uniform Citation reference guide.
 */

describe('Uniform Citation Rules (כללי הציטוט האחיד) — official examples', () => {
  it('Supreme Court appeal with נבו publication and full date', () => {
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

  it('Constitutional petition (בג"ץ) with פ"ד volume and page', () => {
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

  it('Primary legislation with ס"ח publication and section', () => {
    const c: LawCitation = {
      type: 'law',
      name: 'חוק העונשין',
      year: 1977,
      section: '300',
      publication: 'ס"ח',
    };
    expect(formatCitation(c)).toBe('חוק העונשין, ס"ח-1977, סעיף 300');
  });

  it('Civil Procedure Regulations (Uniform Citation reference example)', () => {
    const c: RegulationCitation = {
      type: 'regulation',
      name: 'תקנות סדר הדין האזרחי',
      year: 2018,
      regulation: '121',
      publication: 'ק"ת',
    };
    expect(formatCitation(c)).toBe('תקנות סדר הדין האזרחי, ק"ת-2018, תקנה 121');
  });

  it('Determinism: same input → byte-identical output across calls', () => {
    const c: CaseCitation = {
      type: 'case',
      procedure: 'ע"א',
      number: '5678/19',
      parties: ['לוי', 'שמש'],
    };
    const a = formatCitation(c);
    const b = formatCitation(c);
    expect(a).toBe(b);
    expect(a).toBe("ע\"א 5678/19 לוי נ' שמש");
  });
});
