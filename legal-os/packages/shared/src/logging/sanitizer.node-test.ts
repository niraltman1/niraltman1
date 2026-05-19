// Node.js built-in test runner to avoid Vite SSR module export issues
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForLog, sanitizeUrlForLog } from './sanitizer.js';

describe('sanitizeForLog', () => {
  test('redacts 9-digit Israeli ID numbers', () => {
    assert.equal(sanitizeForLog('ID: 123456789'), 'ID: [ID_NUMBER]');
  });

  test('does not redact 8-digit numbers', () => {
    assert.equal(sanitizeForLog('12345678'), '12345678');
  });

  test('redacts Israeli mobile numbers', () => {
    assert.equal(sanitizeForLog('050-1234567'), '[PHONE]');
  });

  test('redacts email addresses', () => {
    assert.equal(sanitizeForLog('user@example.com'), '[EMAIL]');
  });

  test('redacts JSON id_number field', () => {
    assert.ok(sanitizeForLog('{"id_number":"123456789"}').includes('"id_number":"[REDACTED]"'));
  });

  test('redacts JSON phone field', () => {
    assert.ok(sanitizeForLog('{"phone":"050-1234567"}').includes('"phone":"[REDACTED]"'));
  });

  test('redacts password field', () => {
    assert.ok(sanitizeForLog('{"password":"secret123"}').includes('"password":"[REDACTED]"'));
  });

  test('leaves clean strings unchanged', () => {
    const clean = 'Processing document legal-os-2024.pdf';
    assert.equal(sanitizeForLog(clean), clean);
  });
});

describe('sanitizeUrlForLog', () => {
  test('strips sensitive query params', () => {
    const result = sanitizeUrlForLog('/api/search?q=john+doe&limit=10');
    assert.ok(result.includes('[REDACTED]'), `Expected [REDACTED] in: ${result}`);
    assert.ok(!result.includes('john'), `Expected john to be removed: ${result}`);
    assert.ok(result.includes('limit=10'));
  });

  test('leaves non-sensitive params untouched', () => {
    assert.equal(sanitizeUrlForLog('/api/clients?page=1&limit=20'), '/api/clients?page=1&limit=20');
  });

  test('handles URLs without query params', () => {
    assert.equal(sanitizeUrlForLog('/api/clients/123'), '/api/clients/123');
  });

  test('returns non-path strings unchanged', () => {
    assert.equal(sanitizeUrlForLog('not-a-url'), 'not-a-url');
    assert.equal(sanitizeUrlForLog('plain-text'), 'plain-text');
  });
});
