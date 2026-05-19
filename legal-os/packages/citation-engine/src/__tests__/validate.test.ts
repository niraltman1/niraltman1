import { describe, it, expect } from 'vitest';
import { validateCitation } from '@legal-os/citation-engine';
import type { CaseCitation, LawCitation, BookCitation, ArticleCitation } from '@legal-os/citation-engine';

describe('validateCitation — CaseCitation', () => {
  const valid: CaseCitation = {
    type: 'case',
    procedure: 'רע"א',
    number: '1234/21',
    parties: ['כהן', 'מדינת ישראל'],
    publication: 'נבו',
    date: '11.3.2021',
  };

  it('passes a fully valid case citation', () => {
    const r = validateCitation(valid);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it('errors on unknown procedure', () => {
    const r = validateCitation({ ...valid, procedure: 'xyz' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'INVALID_PROCEDURE')).toBe(true);
  });

  it('errors on malformed case number', () => {
    const r = validateCitation({ ...valid, number: 'abc' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'INVALID_CASE_NUMBER')).toBe(true);
  });

  it('warns on missing parties', () => {
    const r = validateCitation({ ...valid, parties: [] });
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'MISSING_PARTIES')).toBe(true);
  });

  it('warns on unknown publication', () => {
    const r = validateCitation({ ...valid, publication: 'UNKNOWN_PUB' });
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'UNKNOWN_PUBLICATION')).toBe(true);
  });

  it('errors on invalid date format', () => {
    const r = validateCitation({ ...valid, date: '2021/03/11' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'INVALID_DATE')).toBe(true);
  });

  it('accepts valid date without publication', () => {
    const r = validateCitation({ type: 'case', procedure: 'ע"א', number: '5678/19', parties: ['לוי', 'שמש'] });
    expect(r.valid).toBe(true);
  });
});

describe('validateCitation — LawCitation', () => {
  const valid: LawCitation = {
    type: 'law',
    name: 'חוק העונשין',
    year: 1977,
    section: '300',
    publication: 'ס"ח',
  };

  it('passes a valid law citation', () => {
    expect(validateCitation(valid).valid).toBe(true);
  });

  it('errors on year <= 1900', () => {
    const r = validateCitation({ ...valid, year: 1800 });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'MISSING_YEAR')).toBe(true);
  });
});

describe('validateCitation — BookCitation', () => {
  const valid: BookCitation = {
    type: 'book',
    authors: ['אהרן ברק'],
    title: 'פרשנות במשפט',
    year: 2003,
  };

  it('passes a valid book citation', () => {
    expect(validateCitation(valid).valid).toBe(true);
  });

  it('warns on empty authors', () => {
    const r = validateCitation({ ...valid, authors: [] });
    expect(r.warnings.some(w => w.code === 'MISSING_AUTHORS')).toBe(true);
  });
});

describe('validateCitation — ArticleCitation', () => {
  const valid: ArticleCitation = {
    type: 'article',
    authors: ['מיכאל ויגודה'],
    title: 'מאמר לדוגמה',
    journal: 'משפטים',
    volume: 30,
    year: 2000,
    firstPage: '1',
  };

  it('passes a valid article citation', () => {
    expect(validateCitation(valid).valid).toBe(true);
  });

  it('errors on empty journal', () => {
    const r = validateCitation({ ...valid, journal: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'MISSING_JOURNAL')).toBe(true);
  });
});
