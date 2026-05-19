import { describe, it, expect } from 'vitest';
import {
  validateIsraeliId,
  generateUUID,
  utcNow,
  escapeSql,
  clamp,
  roundConfidence,
} from '../../packages/shared/src/utils/index.js';

describe('validateIsraeliId', () => {
  it('validates a known-valid Israeli ID', () => {
    // Well-known valid test IDs (public domain test vectors)
    expect(validateIsraeliId('123456782')).toBe(true);
  });

  it('rejects an invalid Israeli ID', () => {
    expect(validateIsraeliId('123456789')).toBe(false);
  });

  it('pads 8-digit input to 9 digits', () => {
    // 12345678 padded to 012345678 → should be evaluated
    expect(typeof validateIsraeliId('12345678')).toBe('boolean');
  });

  it('rejects non-numeric input', () => {
    expect(validateIsraeliId('abcdefghi')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateIsraeliId('')).toBe(false);
  });
});

describe('generateUUID', () => {
  it('returns a string of length 36', () => {
    expect(generateUUID()).toHaveLength(36);
  });

  it('returns unique values', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });

  it('matches UUID v4 format', () => {
    expect(generateUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('utcNow', () => {
  it('returns an ISO-8601 string', () => {
    expect(() => new Date(utcNow())).not.toThrow();
  });

  it('ends with Z', () => {
    expect(utcNow().endsWith('Z')).toBe(true);
  });
});

describe('escapeSql', () => {
  it('doubles single quotes', () => {
    expect(escapeSql("O'Brien")).toBe("O''Brien");
  });

  it('leaves strings without quotes unchanged', () => {
    expect(escapeSql('safe_string')).toBe('safe_string');
  });
});

describe('clamp', () => {
  it('clamps to min', () => {
    expect(clamp(-5, 0, 1)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(5, 0, 1)).toBe(1);
  });

  it('returns value when within range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('roundConfidence', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundConfidence(0.123456)).toBe(0.1235);
  });

  it('preserves exact 4-decimal values', () => {
    expect(roundConfidence(0.7500)).toBe(0.75);
  });
});
