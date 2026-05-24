import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv:         string;  // hex, 12 bytes
  tag:        string;  // hex, 16 bytes
}

export function encryptAES256GCM(plaintext: Buffer, key: Buffer): EncryptedPayload {
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return { ciphertext: ct, iv: iv.toString('hex'), tag: tag.toString('hex') };
}

export function decryptAES256GCM(payload: EncryptedPayload, key: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}
