import type { DatabaseConnection } from '@legal-os/database';
import { encryptAES256GCM, decryptAES256GCM } from './aes-cipher.js';
import { deriveBackupKey } from './key-provider.js';

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  tag: string;
  keyDerivation: string;
}

async function getKey(): Promise<Buffer> {
  const derived = await deriveBackupKey();
  if (!derived) throw new Error('[FieldCipher] No encryption key available — set BACKUP_ENCRYPT_KEY or BACKUP_PASSPHRASE');
  return derived.key;
}

export async function encryptField(plaintext: string): Promise<EncryptedField> {
  const key = await getKey();
  const payload = encryptAES256GCM(Buffer.from(plaintext, 'utf-8'), key);
  return {
    ciphertext:    payload.ciphertext.toString('base64'),
    iv:            payload.iv,
    tag:           payload.tag,
    keyDerivation: 'env',
  };
}

export async function decryptField(ef: EncryptedField): Promise<string> {
  const key = await getKey();
  const plain = decryptAES256GCM(
    { ciphertext: Buffer.from(ef.ciphertext, 'base64'), iv: ef.iv, tag: ef.tag },
    key,
  );
  return plain.toString('utf-8');
}

export async function storeEncryptedField(
  db: DatabaseConnection,
  tableName: string,
  rowId: number,
  fieldName: string,
  plaintext: string,
): Promise<void> {
  const ef = await encryptField(plaintext);
  db.prepare(`
    INSERT INTO encrypted_fields (table_name, row_id, field_name, ciphertext, iv, tag, key_derivation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_name, row_id, field_name) DO UPDATE SET
      ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag,
      key_derivation = excluded.key_derivation
  `).run(tableName, rowId, fieldName, ef.ciphertext, ef.iv, ef.tag, ef.keyDerivation);
}

export async function retrieveEncryptedField(
  db: DatabaseConnection,
  tableName: string,
  rowId: number,
  fieldName: string,
): Promise<string | null> {
  const row = db.prepare(
    'SELECT ciphertext, iv, tag FROM encrypted_fields WHERE table_name=? AND row_id=? AND field_name=?',
  ).get(tableName, rowId, fieldName) as { ciphertext: string; iv: string; tag: string } | undefined;
  if (!row) return null;
  return decryptField({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, keyDerivation: 'env' });
}
