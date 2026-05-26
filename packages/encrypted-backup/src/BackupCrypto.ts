import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BackupManifest, BackupResult, RestoreResult, BackupEncryptionAlgorithm } from './types.js';

const ALGORITHM: BackupEncryptionAlgorithm = 'aes-256-gcm';
const KEY_LENGTH = 32;  // 256 bits
const IV_LENGTH = 12;   // 96-bit nonce (GCM standard)
const TAG_LENGTH = 16;  // 128-bit auth tag

/** Derive a 32-byte key from a passphrase using PBKDF2-SHA256. */
export async function deriveKeyFromPassphrase(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(passphrase, salt, 310_000, KEY_LENGTH, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Read encryption key from BACKUP_ENCRYPT_KEY env var (hex, 64 chars = 32 bytes). */
export function keyFromEnv(): Buffer | null {
  const raw = process.env['BACKUP_ENCRYPT_KEY'];
  if (!raw || raw.length !== 64) return null;
  try {
    return Buffer.from(raw, 'hex');
  } catch {
    return null;
  }
}

/** Encrypt a Buffer using AES-256-GCM. Returns { encrypted, iv, authTag }. */
export function encryptBuffer(plaintext: Buffer, key: Buffer): {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

/** Decrypt a Buffer using AES-256-GCM. Throws if auth tag verification fails. */
export function decryptBuffer(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/** SHA-256 hash of a Buffer, base64-encoded. */
function sha256b64(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

/**
 * Encrypt a SQLite database file.
 * Reads the entire DB into memory — suitable for DB files up to ~500MB.
 * Writes two files: {backupId}.enc and {backupId}.manifest.json
 */
export async function encryptDb(
  dbPath: string,
  outputDir: string,
  key: Buffer,
  appVersion: string,
): Promise<BackupResult> {
  const plaintext = await fs.readFile(dbPath);
  const plaintextHash = sha256b64(plaintext);

  const { encrypted, iv, authTag } = encryptBuffer(plaintext, key);
  const encryptedHash = sha256b64(encrypted);

  const backupId = crypto.randomUUID();
  const encPath = path.join(outputDir, `${backupId}.enc`);
  const manifestPath = path.join(outputDir, `${backupId}.manifest.json`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(encPath, encrypted);

  const manifest: BackupManifest = {
    manifestVersion: 1,
    backupId,
    createdAt: new Date().toISOString(),
    appVersion,
    dbPath,
    algorithm: ALGORITHM,
    encryptedHash,
    plaintextHash,
    encryptedSizeBytes: encrypted.length,
    plaintextSizeBytes: plaintext.length,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keySource: process.env['BACKUP_ENCRYPT_KEY'] ? 'env' : 'passphrase',
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return { manifest, encryptedPath: encPath, manifestPath };
}

/**
 * Decrypt a backup and restore the DB.
 * Verifies both the encrypted blob hash and the plaintext hash after decryption.
 */
export async function decryptDb(
  manifestPath: string,
  targetDbPath: string,
  key: Buffer,
): Promise<RestoreResult> {
  const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestRaw) as BackupManifest;

  const encPath = manifestPath.replace('.manifest.json', '.enc');
  const encrypted = await fs.readFile(encPath);

  if (sha256b64(encrypted) !== manifest.encryptedHash) {
    throw new Error('Encrypted blob hash mismatch — file may be corrupted');
  }

  const iv = Buffer.from(manifest.iv, 'base64');
  const authTag = Buffer.from(manifest.authTag, 'base64');
  const plaintext = decryptBuffer(encrypted, key, iv, authTag);

  const verifiedHash = sha256b64(plaintext) === manifest.plaintextHash;

  await fs.writeFile(targetDbPath, plaintext);

  return { restoredDbPath: targetDbPath, verifiedHash, manifest };
}

/** Verify a backup's integrity without writing to disk. */
export async function verifyBackup(manifestPath: string, key: Buffer): Promise<boolean> {
  try {
    const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as BackupManifest;
    const encPath = manifestPath.replace('.manifest.json', '.enc');
    const encrypted = await fs.readFile(encPath);
    if (sha256b64(encrypted) !== manifest.encryptedHash) return false;
    const iv = Buffer.from(manifest.iv, 'base64');
    const authTag = Buffer.from(manifest.authTag, 'base64');
    const plaintext = decryptBuffer(encrypted, key, iv, authTag);
    return sha256b64(plaintext) === manifest.plaintextHash;
  } catch {
    return false;
  }
}

/** List all backup manifests in a directory. */
export async function listBackups(backupDir: string): Promise<BackupManifest[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(backupDir);
  } catch {
    return [];
  }
  const manifests: BackupManifest[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.manifest.json')) continue;
    try {
      const raw = await fs.readFile(path.join(backupDir, entry), 'utf-8');
      manifests.push(JSON.parse(raw) as BackupManifest);
    } catch {
      // skip malformed manifest
    }
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
