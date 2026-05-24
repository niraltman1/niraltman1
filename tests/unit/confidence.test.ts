import { describe, it, expect } from 'vitest';
import { ConfidenceCalculator } from '../../packages/ai/src/confidence.js';
import { CONFIDENCE_THRESHOLD } from '../../packages/shared/src/types/processing.js';

const calculator = new ConfidenceCalculator();

describe('ConfidenceCalculator', () => {
  it('returns total between 0 and 1', () => {
    const result = calculator.calculate({
      ocrConfidence:        0.9,
      regexMatchCount:      3,
      regexPossibleCount:   5,
      aiResponseConfidence: 0.8,
      crossDocumentMatches: 2,
      fieldsPopulated:      6,
      totalFields:          8,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(1);
  });

  it('meets threshold for high-quality inputs', () => {
    const result = calculator.calculate({
      ocrConfidence:        0.95,
      regexMatchCount:      5,
      regexPossibleCount:   5,
      aiResponseConfidence: 0.9,
      crossDocumentMatches: 3,
      fieldsPopulated:      8,
      totalFields:          8,
    });
    expect(result.meetsThreshold).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('does not meet threshold for low-quality inputs', () => {
    const result = calculator.calculate({
      ocrConfidence:        0.2,
      regexMatchCount:      0,
      regexPossibleCount:   5,
      aiResponseConfidence: 0.3,
      crossDocumentMatches: 0,
      fieldsPopulated:      1,
      totalFields:          8,
    });
    expect(result.meetsThreshold).toBe(false);
    expect(result.total).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('caps AI contribution below its raw value (AI advisory only)', () => {
    const highAi = calculator.calculate({
      ocrConfidence:        0,
      regexMatchCount:      0,
      regexPossibleCount:   5,
      aiResponseConfidence: 1.0,
      crossDocumentMatches: 0,
      fieldsPopulated:      0,
      totalFields:          8,
    });
    const noAi = calculator.calculate({
      ocrConfidence:        0,
      regexMatchCount:      0,
      regexPossibleCount:   5,
      aiResponseConfidence: 0,
      crossDocumentMatches: 0,
      fieldsPopulated:      0,
      totalFields:          8,
    });
    // AI alone should not meet the threshold
    expect(highAi.total).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(highAi.total).toBeGreaterThan(noAi.total);
  });

  it('returns deterministic results for same inputs', () => {
    const inputs = {
      ocrConfidence:        0.7,
      regexMatchCount:      3,
      regexPossibleCount:   4,
      aiResponseConfidence: 0.6,
      crossDocumentMatches: 1,
      fieldsPopulated:      5,
      totalFields:          8,
    };
    const r1 = calculator.calculate(inputs);
    const r2 = calculator.calculate(inputs);
    expect(r1.total).toBe(r2.total);
  });

  it('handles zero totalFields without throwing', () => {
    expect(() =>
      calculator.calculate({
        ocrConfidence:        0.8,
        regexMatchCount:      2,
        regexPossibleCount:   3,
        aiResponseConfidence: 0.7,
        crossDocumentMatches: 1,
        fieldsPopulated:      0,
        totalFields:          0,
      }),
    ).not.toThrow();
  });
});
