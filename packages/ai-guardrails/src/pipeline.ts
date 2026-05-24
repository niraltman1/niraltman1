import type { ExtractionPayload, GuardrailContext, GuardrailResult, GuardrailStatus } from './types.js';
import { detectHallucination } from './hallucination.js';
import { verifyCitation } from './citation-verifier.js';
import { checkConfidence } from './confidence-gate.js';
import { checkPrivilege } from './privilege-shield.js';
import { isolateInjection } from './injection-isolator.js';

export interface PipelineResult {
  aggregate:     GuardrailStatus;
  results:       GuardrailResult[];
  shouldApply:   boolean;  // false if aggregate === 'fail'
  flagForReview: boolean;  // true if aggregate === 'warn' or 'fail'
}

/**
 * Runs all guardrails in sequence and returns the aggregate result.
 *
 * Aggregation rules:
 * - If ANY guardrail returns 'fail', the aggregate is 'fail'.
 * - If ANY guardrail returns 'warn' (and none fail), aggregate is 'warn'.
 * - Otherwise 'pass'.
 */
export function runGuardrails(
  payload: ExtractionPayload,
  ctx: GuardrailContext,
): PipelineResult {
  const results: GuardrailResult[] = [
    // Run injection check on the raw OCR text first — if the source is tainted,
    // extraction results derived from it are suspect.
    isolateInjection(ctx.ocrText),
    checkConfidence(payload, ctx),
    detectHallucination(payload, ctx),
    verifyCitation(payload, ctx),
    // Check the OCR text for privileged identifiers that shouldn't be in logs.
    checkPrivilege(ctx.ocrText),
  ];

  let aggregate: GuardrailStatus = 'pass';
  for (const result of results) {
    if (result.status === 'fail') {
      aggregate = 'fail';
      break;
    }
    if (result.status === 'warn') {
      aggregate = 'warn';
    }
  }

  return {
    aggregate,
    results,
    shouldApply:   aggregate !== 'fail',
    flagForReview: aggregate !== 'pass',
  };
}
