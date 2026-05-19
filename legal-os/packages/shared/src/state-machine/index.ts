import type { ProcessingState } from '../types/processing.js';

/** Map of allowed state transitions. */
const ALLOWED_TRANSITIONS: Readonly<Record<ProcessingState, readonly ProcessingState[]>> = {
  DISCOVERED:     ['HASHED',         'FAILED'],
  HASHED:         ['OCR_PENDING',    'FAILED'],
  OCR_PENDING:    ['OCR_COMPLETE',   'FAILED'],
  OCR_COMPLETE:   ['CLASSIFIED',     'FAILED'],
  CLASSIFIED:     ['ENRICHED',       'REVIEW_PENDING', 'FAILED'],
  ENRICHED:       ['REVIEW_PENDING', 'FAILED'],
  REVIEW_PENDING: ['APPLIED',        'FAILED'],
  APPLIED:        ['VERIFIED',       'FAILED'],
  VERIFIED:       ['FAILED'],
  FAILED:         ['ROLLED_BACK',    'DISCOVERED'],
  ROLLED_BACK:    ['DISCOVERED'],
};

/** Terminal states that do not feed back into normal processing. */
export const TERMINAL_STATES: readonly ProcessingState[] = ['VERIFIED', 'ROLLED_BACK'];

/** States considered failure outcomes. */
export const FAILURE_STATES: readonly ProcessingState[] = ['FAILED', 'ROLLED_BACK'];

/**
 * Returns true if the transition from `from` to `to` is valid.
 */
export function isValidTransition(from: ProcessingState, to: ProcessingState): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly ProcessingState[]).includes(to);
}

/**
 * Returns the list of states reachable from `from`.
 */
export function getAllowedTransitions(from: ProcessingState): readonly ProcessingState[] {
  return ALLOWED_TRANSITIONS[from];
}

export interface TransitionResult {
  readonly success: true;
  readonly from: ProcessingState;
  readonly to: ProcessingState;
}

export interface TransitionError {
  readonly success: false;
  readonly from: ProcessingState;
  readonly to: ProcessingState;
  readonly reason: string;
}

/**
 * Validates a requested state transition without mutating any state.
 * Returns a discriminated union of TransitionResult | TransitionError.
 */
export function validateTransition(
  from: ProcessingState,
  to: ProcessingState,
): TransitionResult | TransitionError {
  if (!isValidTransition(from, to)) {
    return {
      success: false,
      from,
      to,
      reason: `Invalid transition: ${from} → ${to}. Allowed: ${getAllowedTransitions(from).join(', ')}`,
    };
  }
  return { success: true, from, to };
}
