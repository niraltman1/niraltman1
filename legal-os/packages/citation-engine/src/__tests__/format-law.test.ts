import { describe, it, expect } from 'vitest';
import { formatCitation } from '@legal-os/citation-engine';
import type { LawCitation, RegulationCitation, BookCitation, ArticleCitation } from '@legal-os/citation-engine';

describe('formatCitation — LawCitation (Nevo 2021)', () => {
  it('formats law with publication', () => {
    const c: LawCitation = {
      type: 'law',
      name: 'חוק העונשין',
      year: 1977,
      section: '300',
      publication: 'ס"ח',
    };
    expect(formatCitation(c)).toBe('חוק העונשין, ס"ח-1977, סעיף 300');
  });

  it('formats law without publication — uses year directly', () => {
    const c: LawCitation = {
      type: 'law',
      name: 'חוק החוזים (חלק כללי)',
      year: 1973,
    };
    expect(formatCitation(c)).toBe('חוק החוזים (חלק כללי), 1973');
  });

  it('formats law without section', () => {
    const c: LawCitation = {
      type: 'law',
      name: 'חוק הגנת הצרכן',
      year: 1981,
      publication: 'ס"ח',
    };
    expect(formatCitation(c)).toBe('חוק הגנת הצרכן, ס"ח-1981');
  });
});

describe('formatCitation — RegulationCitation (Nevo 2021)', () => {
  it('formats regulation with publication and regulation number', () => {
    const c: RegulationCitation = {
      type: 'regulation',
      name: 'תקנות סדר הדין האזרחי',
      year: 1984,
      publication: 'ק"ת',
      regulation: '12',
    };
    expect(formatCitation(c)).toBe('תקנות סדר הדין האזרחי, ק"ת-1984, תקנה 12');
  });
});

describe('formatCitation — BookCitation (Nevo 2021)', () => {
  it('formats single-author book', () => {
    const c: BookCitation = {
      type: 'book',
      authors: ['אהרן ברק'],
      title: 'פרשנות במשפט',
      year: 2003,
    };
    expect(formatCitation(c)).toBe('אהרן ברק פרשנות במשפט (2003)');
  });

  it('formats book with edition and volume', () => {
    const c: BookCitation = {
      type: 'book',
      authors: ['גבריאל קלינג'],
      title: 'אתיקה בעריכת דין',
      edition: 2,
      volume: 1,
      year: 2001,
      pages: '450',
    };
    expect(formatCitation(c)).toBe('גבריאל קלינג אתיקה בעריכת דין (מהדורה 2) כרך 1 (2001) 450');
  });

  it('omits edition block for first edition', () => {
    const c: BookCitation = {
      type: 'book',
      authors: ['מחבר'],
      title: 'ספר',
      edition: 1,
      year: 2000,
    };
    expect(formatCitation(c)).not.toContain('מהדורה');
  });
});

describe('formatCitation — ArticleCitation (Nevo 2021)', () => {
  it('formats article with all fields', () => {
    const c: ArticleCitation = {
      type: 'article',
      authors: ['מיכאל ויגודה'],
      title: 'מאמר לדוגמה',
      journal: 'משפטים',
      volume: 30,
      year: 2000,
      firstPage: '1',
      citedPage: '15',
    };
    expect(formatCitation(c)).toBe('מיכאל ויגודה "מאמר לדוגמה" 30 משפטים 1 (2000) 15');
  });
});
