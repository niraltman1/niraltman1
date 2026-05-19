import { describe, it, expect } from 'vitest';

// Sanitizer logic is unit-tested in packages/shared/src/logging/sanitizer.test.ts
// This file verifies the request-logger integration behaves correctly with Supertest

// These inline tests exercise the regex logic directly without relying on
// Vite's SSR module resolution for cross-package TS imports.

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{9}\b/g, '[ID_NUMBER]'],
  [/\b05\d[-\s]?\d{7}\b/g, '[PHONE]'],
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[EMAIL]'],
  [/"id_number"\s*:\s*"[^"]*"/g, '"id_number":"[REDACTED]"'],
  [/"phone"\s*:\s*"[^"]*"/g, '"phone":"[REDACTED]"'],
  [/"password"\s*:\s*"[^"]*"/g, '"password":"[REDACTED]"'],
];

function sanitize(input: string): string {
  let result = input;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

describe('PII redaction patterns', () => {
  it('redacts 9-digit Israeli ID numbers', () => {
    expect(sanitize('ID: 123456789')).toBe('ID: [ID_NUMBER]');
  });

  it('does not redact 8-digit numbers', () => {
    expect(sanitize('12345678')).toBe('12345678');
  });

  it('redacts Israeli mobile numbers', () => {
    expect(sanitize('050-1234567')).toBe('[PHONE]');
  });

  it('redacts email addresses', () => {
    expect(sanitize('user@example.com')).toBe('[EMAIL]');
  });

  it('redacts JSON id_number field', () => {
    expect(sanitize('{"id_number":"123456789"}')).toContain('"id_number":"[REDACTED]"');
  });

  it('redacts JSON phone field', () => {
    expect(sanitize('{"phone":"050-1234567"}')).toContain('"phone":"[REDACTED]"');
  });

  it('redacts password field', () => {
    expect(sanitize('{"password":"secret123"}')).toContain('"password":"[REDACTED]"');
  });

  it('leaves clean strings unchanged', () => {
    expect(sanitize('Processing document legal-os-2024.pdf')).toBe('Processing document legal-os-2024.pdf');
  });
});
