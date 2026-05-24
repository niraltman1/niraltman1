import { describe, it, expect } from 'vitest';
import { normalizeCourt, courtRank, COURT_LEVELS } from './courts.js';
import { normalizeJudge } from './judges.js';
import { getSynonymExpansions, LEGAL_SYNONYM_GROUPS } from './synonyms.js';

describe('normalizeCourt', () => {
  it('maps exact alias to canonical name', () => {
    expect(normalizeCourt('עליון')).toBe('בית המשפט העליון');
    expect(normalizeCourt('שלום')).toBe('בית משפט השלום');
    expect(normalizeCourt('מחוזי')).toBe('בית המשפט המחוזי');
  });

  it('maps beit-hamishpat abbreviations', () => {
    expect(normalizeCourt('ביהמ"ש העליון')).toBe('בית המשפט העליון');
    expect(normalizeCourt('בג"ץ')).toBe('בית המשפט העליון');
  });

  it('returns input unchanged for unknown courts', () => {
    expect(normalizeCourt('בית הדין הרבני')).toBe('בית הדין הרבני');
  });

  it('trims whitespace', () => {
    expect(normalizeCourt('  עליון  ')).toBe('בית המשפט העליון');
  });

  it('matches partial alias within longer string', () => {
    const result = normalizeCourt('בית משפט השלום תל-אביב');
    expect(result).toBe('בית משפט השלום');
  });
});

describe('courtRank', () => {
  it('supreme court has rank 1', () => {
    expect(courtRank('בית המשפט העליון')).toBe(1);
  });

  it('district court has rank 2', () => {
    expect(courtRank('בית המשפט המחוזי')).toBe(2);
  });

  it('magistrate court has rank 3', () => {
    expect(courtRank('בית משפט השלום')).toBe(3);
  });

  it('unknown court returns rank 99', () => {
    expect(courtRank('בית דין לא קיים')).toBe(99);
  });

  it('COURT_LEVELS has 6 entries', () => {
    expect(COURT_LEVELS).toHaveLength(6);
  });
});

describe('normalizeJudge', () => {
  it('strips כב השופט honorific', () => {
    expect(normalizeJudge('כב׳ השופט לוי')).toBe('לוי');
    expect(normalizeJudge("כב' השופטת כהן")).toBe('כהן');
  });

  it('strips ד"ר השופט prefix', () => {
    expect(normalizeJudge('ד"ר השופט אברהם')).toBe('אברהם');
  });

  it('strips plain השופט prefix', () => {
    expect(normalizeJudge('השופט מזרחי')).toBe('מזרחי');
    expect(normalizeJudge('השופטת לוי')).toBe('לוי');
  });

  it('returns plain name unchanged', () => {
    expect(normalizeJudge('רות בן-ישראל')).toBe('רות בן-ישראל');
  });
});

describe('getSynonymExpansions', () => {
  it('returns synonyms for a known term', () => {
    const expansions = getSynonymExpansions('תביעה');
    expect(expansions).toContain('תובענה');
    expect(expansions).toContain('בקשה');
    expect(expansions).not.toContain('תביעה');
  });

  it('returns empty array for unknown term', () => {
    expect(getSynonymExpansions('מילה_לא_קיימת')).toHaveLength(0);
  });

  it('LEGAL_SYNONYM_GROUPS is non-empty', () => {
    expect(LEGAL_SYNONYM_GROUPS.length).toBeGreaterThan(0);
  });

  it('synonym lookup is symmetric — each member finds the others', () => {
    for (const group of LEGAL_SYNONYM_GROUPS) {
      for (const term of group) {
        const expansions = getSynonymExpansions(term);
        expect(expansions.length).toBe(group.length - 1);
      }
    }
  });
});
