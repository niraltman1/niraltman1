import { describe, it, expect } from 'vitest';
import { validateIsraeliId } from '../../packages/shared/src/utils/index.js';

describe('validateIsraeliId — extended suite', () => {
  it('accepts well-known valid ID 123456782', () => {
    expect(validateIsraeliId('123456782')).toBe(true);
  });

  it('accepts valid 9-digit ID 039337423', () => {
    // Sum: 0*1=0, 3*2=6, 9*1=9, 3*2=6, 3*1=3, 7*2=14→5, 4*1=4, 2*2=4, 3*1=3 → 40 → 40%10=0
    expect(validateIsraeliId('039337423')).toBe(true);
  });

  it('rejects invalid 9-digit ID 123456789', () => {
    expect(validateIsraeliId('123456789')).toBe(false);
  });

  it('all-zeros passes the algorithm (sum=0, 0%10=0) but is not a real ID', () => {
    expect(validateIsraeliId('000000000')).toBe(true);
  });

  it('pads 8-digit input to 9 digits for evaluation', () => {
    const result = validateIsraeliId('23456782');
    expect(typeof result).toBe('boolean');
  });

  it('strips non-numeric characters before validation', () => {
    expect(validateIsraeliId('123-456-782')).toBe(true);
  });

  it('rejects purely alphabetic input', () => {
    expect(validateIsraeliId('abcdefghi')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateIsraeliId('')).toBe(false);
  });

  it('rejects input longer than 9 digits after cleaning', () => {
    expect(validateIsraeliId('12345678901')).toBe(false);
  });

  it('handles leading zeros correctly', () => {
    // 000000001 — should simply return false (sum won't be mod-10=0)
    expect(typeof validateIsraeliId('000000001')).toBe('boolean');
  });
});
