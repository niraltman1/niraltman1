export type {
  DbHandle,
  ProceduralStep,
  CompletenessReport,
  RiskFactor,
  RiskScore,
  EvidenceGap,
  ContradictionFinding,
} from './types.js';

export {
  getCaseCompleteness,
  seedProceduralChecklist,
  markStepComplete,
  markStepMissing,
} from './completeness.js';

export {
  scoreCase,
  persistRiskScore,
} from './risk-scorer.js';

export { analyzeEvidenceGaps } from './evidence-gaps.js';

export { detectContradictions } from './contradiction-detector.js';

export type { FilingNode } from './dependency-graph.js';
export { getFilingDependencyGraph } from './dependency-graph.js';
