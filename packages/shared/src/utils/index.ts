/**
 * Validates an Israeli national ID number using the Luhn algorithm variant
 * used by the Israeli Ministry of the Interior.
 */
export function validateIsraeliId(id: string): boolean {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 0) return false;
  const cleaned = digits.padStart(9, '0');
  if (cleaned.length !== 9) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(cleaned[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Generates a v4-compatible UUID using the Web Crypto API (available in Node 19+ and browsers). */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for Node < 19 in test environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Returns the current UTC timestamp as an ISO-8601 string. */
export function utcNow(): string {
  return new Date().toISOString();
}

/** Escapes a string for safe interpolation into a SQLite literal. */
export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Clamps a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Rounds a confidence score to 4 decimal places. */
export function roundConfidence(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
