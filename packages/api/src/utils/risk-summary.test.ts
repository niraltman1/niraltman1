import { describe, it, expect } from 'vitest';
import { assessCaseRisk, proceduralBand, evidenceBand, deadlineBand } from './risk-summary.js';

describe('risk-summary (Milestone 1)', () => {
  describe('proceduralBand', () => {
    it('is low when there is no checklist', () => {
      expect(proceduralBand(false, 0)).toBe('low');
    });
    it('bands by completeness score', () => {
      expect(proceduralBand(true, 0.4)).toBe('high');
      expect(proceduralBand(true, 0.6)).toBe('medium');
      expect(proceduralBand(true, 0.9)).toBe('low');
    });
  });

  describe('evidenceBand', () => {
    it('returns the worst gap priority present', () => {
      expect(evidenceBand(['low', 'high', 'medium'])).toBe('high');
      expect(evidenceBand(['low', 'medium'])).toBe('medium');
      expect(evidenceBand(['low'])).toBe('low');
      expect(evidenceBand([])).toBe('low');
    });
  });

  describe('deadlineBand', () => {
    it('treats overdue/critical as high, soon as medium', () => {
      expect(deadlineBand(['upcoming', 'overdue'])).toBe('high');
      expect(deadlineBand(['critical'])).toBe('high');
      expect(deadlineBand(['soon', 'upcoming'])).toBe('medium');
      expect(deadlineBand(['upcoming'])).toBe('low');
      expect(deadlineBand([])).toBe('low');
    });
  });

  describe('assessCaseRisk', () => {
    it('composes all dimensions + counts', () => {
      const r = assessCaseRisk({
        caseId: 42,
        hasChecklist: true,
        completenessScore: 0.4,
        evidenceGapPriorities: ['medium', 'high'],
        deadlineRisks: ['soon'],
        unverifiedInsights: 5,
        unresolvedCitations: 2,
      });
      expect(r).toEqual({
        caseId: 42,
        procedural: 'high',
        evidence: 'high',
        deadline: 'medium',
        missingDocuments: 2,
        unverifiedInsights: 5,
        unresolvedCitations: 2,
      });
    });

    it('is all-low for a clean matter', () => {
      const r = assessCaseRisk({
        caseId: 1, hasChecklist: true, completenessScore: 1,
        evidenceGapPriorities: [], deadlineRisks: ['upcoming'],
        unverifiedInsights: 0, unresolvedCitations: 0,
      });
      expect(r.procedural).toBe('low');
      expect(r.evidence).toBe('low');
      expect(r.deadline).toBe('low');
      expect(r.missingDocuments).toBe(0);
    });
  });
});
