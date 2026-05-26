// Uses the Node.js built-in test runner (not Vitest) to avoid the Vite SSR
// module export issue that affects imports from node:crypto in vitest pool.
// Run via: node --import tsx/esm --test <this-file>

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env['BACKUP_ENCRYPT_KEY'] = 'a'.repeat(64);

const { encryptField, decryptField } = await import('../field-cipher.js');

test('encryptField/decryptField round-trips ASCII plaintext', async () => {
  const plaintext = 'test-id-number-123456789';
  const ef = await encryptField(plaintext);
  assert.equal(await decryptField(ef), plaintext);
});

test('produces different ciphertexts for the same plaintext (IV randomness)', async () => {
  const ef1 = await encryptField('same-value');
  const ef2 = await encryptField('same-value');
  assert.notEqual(ef1.ciphertext, ef2.ciphertext);
  assert.notEqual(ef1.iv, ef2.iv);
});

test('ciphertext, iv, and tag have expected lengths', async () => {
  const ef = await encryptField('hello');
  assert.ok(ef.ciphertext.length > 0);
  assert.equal(ef.iv.length, 24);   // 12 bytes → 24 hex chars
  assert.equal(ef.tag.length, 32);  // 16 bytes → 32 hex chars
});

test('throws on tampered ciphertext', async () => {
  const ef = await encryptField('sensitive');
  const tampered = { ...ef, ciphertext: ef.ciphertext.slice(0, -4) + 'ffff' };
  await assert.rejects(() => decryptField(tampered));
});

test('round-trips Hebrew PII correctly', async () => {
  const hebrew = 'ישראל ישראלי';
  const ef = await encryptField(hebrew);
  assert.equal(await decryptField(ef), hebrew);
});
