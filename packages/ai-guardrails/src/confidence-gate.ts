import type { ExtractionPayload, GuardrailContext, GuardrailResult } from './types.js';

const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_THRESHOLD  = 0.4;

/**
 * Routes low-confidence extractions to human review queue instead of auto-applying.
 *
 * - confidence >= 0.7 → 'pass'  — auto-apply
 * - confidence 0.4–0.69 → 'warn' — apply but flag for attorney review
 * - confidence < 0.4  → 'fail'  — do not auto-apply, queue for attorney review
 */
export function checkConfidence(
  payload: ExtractionPayload,
  // ctx is part of the guardrail signature for consistency; not used here
  _ctx: GuardrailContext,
): GuardrailResult {
  const { confidence } = payload;

  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
    return {
      status: 'pass',
      guardrail: 'confidence-gate',
      message: `Confidence ${confidence.toFixed(2)} meets auto-apply threshold`,
      details: { confidence },
    };
  }

  if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return {
      status: 'warn',
      guardrail: 'confidence-gate',
      message: `Confidence ${confidence.toFixed(2)} is below high-confidence threshold — flagged for attorney review`,
      details: { confidence },
    };
  }

  return {
    status: 'fail',
    guardrail: 'confidence-gate',
    message: `Confidence ${confidence.toFixed(2)} is too low to auto-apply — queued for attorney review`,
    details: { confidence },
  };
}
