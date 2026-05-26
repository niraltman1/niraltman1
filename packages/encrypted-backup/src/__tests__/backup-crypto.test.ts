import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  encryptBuffer,
  decryptBuffer,
  deriveKeyFromPassphrase,
  keyFromEnv,
} from '../BackupCrypto.js';

const TEST_KEY = crypto.randomBytes(32);

describe('encryptBuffer / decryptBuffer', () => {
  it('round-trips plaintext correctly', () => {
    const plaintext = Buffer.from('Factum IL — test backup content 🇮🇱');
    const { encrypted, iv, authTag } = encryptBuffer(plaintext, TEST_KEY);

    expect(encrypted).not.toEqual(plaintext);

    const decrypted = decryptBuffer(encrypted, TEST_KEY, iv, authTag);
    expect(decrypted.toString('utf-8')).toBe(plaintext.toString('utf-8'));
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const plaintext = Buffer.from('sensitive legal data');
    const { encrypted, iv, authTag } = encryptBuffer(plaintext, TEST_KEY);

    // Tamper with the encrypted data
    const tampered = Buffer.from(encrypted);
    tampered[0] = tampered[0] ^ 0xff;

    expect(() => decryptBuffer(tampered, TEST_KEY, iv, authTag)).toThrow();
  });

  it('throws with wrong key', () => {
    const plaintext = Buffer.from('confidential');
    const { encrypted, iv, authTag } = encryptBuffer(plaintext, TEST_KEY);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decryptBuffer(encrypted, wrongKey, iv, authTag)).toThrow();
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plaintext = Buffer.from('same input');
    const r1 = encryptBuffer(plaintext, TEST_KEY);
    const r2 = encryptBuffer(plaintext, TEST_KEY);
    expect(r1.encrypted.toString('hex')).not.toBe(r2.encrypted.toString('hex'));
    expect(r1.iv.toString('hex')).not.toBe(r2.iv.toString('hex'));
  });
});

describe('deriveKeyFromPassphrase', () => {
  it('derives a 32-byte key', async () => {
    const salt = crypto.randomBytes(16);
    const key = await deriveKeyFromPassphrase('my-secure-passphrase', salt);
    expect(key.length).toBe(32);
  });

  it('is deterministic for same passphrase + salt', async () => {
    const salt = crypto.randomBytes(16);
    const k1 = await deriveKeyFromPassphrase('same-pass', salt);
    const k2 = await deriveKeyFromPassphrase('same-pass', salt);
    expect(k1.toString('hex')).toBe(k2.toString('hex'));
  });
});

describe('keyFromEnv', () => {
  it('returns null when env var not set', () => {
    delete process.env['BACKUP_ENCRYPT_KEY'];
    expect(keyFromEnv()).toBeNull();
  });

  it('returns 32 bytes when env var is valid hex', () => {
    process.env['BACKUP_ENCRYPT_KEY'] = crypto.randomBytes(32).toString('hex');
    const key = keyFromEnv();
    expect(key).not.toBeNull();
    expect(key!.length).toBe(32);
    delete process.env['BACKUP_ENCRYPT_KEY'];
  });
});
