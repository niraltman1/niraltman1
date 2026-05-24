export type {
  GuardrailStatus,
  GuardrailResult,
  ExtractionPayload,
  GuardrailContext,
} from './types.js';

export { detectHallucination } from './hallucination.js';
export { verifyCitation }      from './citation-verifier.js';
export { checkConfidence }     from './confidence-gate.js';
export { shieldPrivileged, checkPrivilege } from './privilege-shield.js';
export { isolateInjection }    from './injection-isolator.js';
export { runGuardrails }       from './pipeline.js';
export type { PipelineResult } from './pipeline.js';
