import { describe, it, expect } from 'vitest';
import {
  validateIsraeliId,
  generateUUID,
  utcNow,
  escapeSql,
  clamp,
  roundConfidence,
} from './utils/index.js';

describe('validateIsraeliId', () => {
  it('accepts valid Israeli ID numbers', () => {
    expect(validateIsraeliId('123456782')).toBe(true);
    expect(validateIsraeliId('000000018')).toBe(true);
  });

  it('rejects invalid check digit', () => {
    expect(validateIsraeliId('123456789')).toBe(false);
  });

  it('pads short numbers with leading zeros', () => {
    expect(validateIsraeliId('18')).toBe(true); // same as 000000018
  });

  it('strips non-digit characters before validating', () => {
    expect(validateIsraeliId('123-456-782')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateIsraeliId('')).toBe(false);
  });
});

describe('generateUUID', () => {
  it('returns a string of length 36', () => {
    expect(generateUUID()).toHaveLength(36);
  });

  it('returns different values on successive calls', () => {
    expect(generateUUID()).not.toBe(generateUUID());
  });

  it('matches UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('utcNow', () => {
  it('returns a valid ISO-8601 string', () => {
    const now = utcNow();
    expect(() => new Date(now)).not.toThrow();
    expect(new Date(now).toISOString()).toBe(now);
  });
});

describe('escapeSql', () => {
  it('doubles single quotes', () => {
    expect(escapeSql("O'Brien")).toBe("O''Brien");
  });

  it('handles strings with no quotes unchanged', () => {
    expect(escapeSql('hello world')).toBe('hello world');
  });

  it('handles multiple quotes', () => {
    expect(escapeSql("it's a 'test'")).toBe("it''s a ''test''");
  });
});

describe('clamp', () => {
  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('roundConfidence', () => {
  it('rounds to 4 decimal places', () => {
    expect(roundConfidence(0.123456789)).toBe(0.1235);
  });

  it('leaves clean values unchanged', () => {
    expect(roundConfidence(0.75)).toBe(0.75);
    expect(roundConfidence(1.0)).toBe(1.0);
    expect(roundConfidence(0.0)).toBe(0.0);
  });
});
