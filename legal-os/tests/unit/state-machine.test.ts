import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  validateTransition,
  getAllowedTransitions,
  TERMINAL_STATES,
  FAILURE_STATES,
} from '../../packages/shared/src/state-machine/index.js';
import type { ProcessingState } from '../../packages/shared/src/types/processing.js';

describe('isValidTransition', () => {
  it('allows DISCOVERED → HASHED', () => {
    expect(isValidTransition('DISCOVERED', 'HASHED')).toBe(true);
  });

  it('allows HASHED → OCR_PENDING', () => {
    expect(isValidTransition('HASHED', 'OCR_PENDING')).toBe(true);
  });

  it('allows OCR_PENDING → OCR_COMPLETE', () => {
    expect(isValidTransition('OCR_PENDING', 'OCR_COMPLETE')).toBe(true);
  });

  it('allows OCR_COMPLETE → CLASSIFIED', () => {
    expect(isValidTransition('OCR_COMPLETE', 'CLASSIFIED')).toBe(true);
  });

  it('allows CLASSIFIED → ENRICHED', () => {
    expect(isValidTransition('CLASSIFIED', 'ENRICHED')).toBe(true);
  });

  it('allows CLASSIFIED → REVIEW_PENDING (direct)', () => {
    expect(isValidTransition('CLASSIFIED', 'REVIEW_PENDING')).toBe(true);
  });

  it('allows ENRICHED → REVIEW_PENDING', () => {
    expect(isValidTransition('ENRICHED', 'REVIEW_PENDING')).toBe(true);
  });

  it('allows REVIEW_PENDING → APPLIED', () => {
    expect(isValidTransition('REVIEW_PENDING', 'APPLIED')).toBe(true);
  });

  it('allows APPLIED → VERIFIED', () => {
    expect(isValidTransition('APPLIED', 'VERIFIED')).toBe(true);
  });

  it('allows FAILED → ROLLED_BACK', () => {
    expect(isValidTransition('FAILED', 'ROLLED_BACK')).toBe(true);
  });

  it('allows FAILED → DISCOVERED (retry)', () => {
    expect(isValidTransition('FAILED', 'DISCOVERED')).toBe(true);
  });

  it('allows ROLLED_BACK → DISCOVERED (re-ingest)', () => {
    expect(isValidTransition('ROLLED_BACK', 'DISCOVERED')).toBe(true);
  });

  const allStates: ProcessingState[] = [
    'DISCOVERED','HASHED','OCR_PENDING','OCR_COMPLETE',
    'CLASSIFIED','ENRICHED','REVIEW_PENDING','APPLIED','VERIFIED',
  ];

  it.each(allStates)('allows %s → FAILED', (state) => {
    expect(isValidTransition(state, 'FAILED')).toBe(true);
  });

  it('rejects DISCOVERED → VERIFIED (skip stages)', () => {
    expect(isValidTransition('DISCOVERED', 'VERIFIED')).toBe(false);
  });

  it('rejects VERIFIED → HASHED (regression)', () => {
    expect(isValidTransition('VERIFIED', 'HASHED')).toBe(false);
  });

  it('rejects HASHED → DISCOVERED (backward)', () => {
    expect(isValidTransition('HASHED', 'DISCOVERED')).toBe(false);
  });
});

describe('validateTransition', () => {
  it('returns success=true for valid transition', () => {
    const result = validateTransition('DISCOVERED', 'HASHED');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.from).toBe('DISCOVERED');
      expect(result.to).toBe('HASHED');
    }
  });

  it('returns success=false with reason for invalid transition', () => {
    const result = validateTransition('VERIFIED', 'DISCOVERED');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('VERIFIED');
      expect(result.reason).toContain('DISCOVERED');
    }
  });
});

describe('getAllowedTransitions', () => {
  it('returns non-empty array for DISCOVERED', () => {
    const allowed = getAllowedTransitions('DISCOVERED');
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain('HASHED');
    expect(allowed).toContain('FAILED');
  });
});

describe('TERMINAL_STATES', () => {
  it('includes VERIFIED', () => {
    expect(TERMINAL_STATES).toContain('VERIFIED');
  });

  it('includes ROLLED_BACK', () => {
    expect(TERMINAL_STATES).toContain('ROLLED_BACK');
  });
});

describe('FAILURE_STATES', () => {
  it('includes FAILED and ROLLED_BACK', () => {
    expect(FAILURE_STATES).toContain('FAILED');
    expect(FAILURE_STATES).toContain('ROLLED_BACK');
  });
});
