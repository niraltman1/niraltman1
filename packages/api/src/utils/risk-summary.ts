/**
 * Per-matter risk aggregation (Milestone 1 — Risk Dashboard, directive P1).
 * Pure functions over already-computed signals — no DB, no AI — so they are
 * trivially unit-testable. The route gathers the raw inputs and calls assessCaseRisk.
 */

export type RiskBand = 'low' | 'medium' | 'high';

export interface RiskAssessment {
  caseId:              number;
  procedural:          RiskBand;
  evidence:            RiskBand;
  deadline:            RiskBand;
  missingDocuments:    number;
  unverifiedInsights:  number;
  unresolvedCitations: number;
}

export interface RiskInputs {
  caseId:                number;
  hasChecklist:          boolean;
  completenessScore:     number; // 0..1 (1 = best); ignored when hasChecklist is false
  evidenceGapPriorities: Array<'low' | 'medium' | 'high'>;
  deadlineRisks:         Array<'overdue' | 'critical' | 'soon' | 'upcoming'>;
  unverifiedInsights:    number;
  unresolvedCitations:   number;
}

/** Procedural risk from checklist completeness (more incomplete → higher risk). */
export function proceduralBand(hasChecklist: boolean, completenessScore: number): RiskBand {
  if (!hasChecklist) return 'low';
  if (completenessScore < 0.5)  return 'high';
  if (completenessScore < 0.75) return 'medium';
  return 'low';
}

/** Evidence risk = the worst evidence-gap priority present. */
export function evidenceBand(priorities: Array<'low' | 'medium' | 'high'>): RiskBand {
  if (priorities.includes('high'))   return 'high';
  if (priorities.includes('medium')) return 'medium';
  return 'low';
}

/** Deadline risk = worst deadline band for the matter (overdue/critical → high). */
export function deadlineBand(risks: Array<'overdue' | 'critical' | 'soon' | 'upcoming'>): RiskBand {
  if (risks.includes('overdue') || risks.includes('critical')) return 'high';
  if (risks.includes('soon')) return 'medium';
  return 'low';
}

export function assessCaseRisk(i: RiskInputs): RiskAssessment {
  return {
    caseId:              i.caseId,
    procedural:          proceduralBand(i.hasChecklist, i.completenessScore),
    evidence:            evidenceBand(i.evidenceGapPriorities),
    deadline:            deadlineBand(i.deadlineRisks),
    missingDocuments:    i.evidenceGapPriorities.length,
    unverifiedInsights:  i.unverifiedInsights,
    unresolvedCitations: i.unresolvedCitations,
  };
}
