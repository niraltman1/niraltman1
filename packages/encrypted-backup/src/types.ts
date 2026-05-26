/**
 * Encrypted backup architecture types.
 * Implementation: AES-256-GCM (Node.js built-in crypto).
 * No cloud sync — local/network-drive only.
 */

export type BackupEncryptionAlgorithm = 'aes-256-gcm';

export interface BackupManifest {
  manifestVersion: 1;
  backupId: string;         // UUID
  createdAt: string;        // ISO8601
  appVersion: string;
  dbPath: string;
  algorithm: BackupEncryptionAlgorithm;
  /** SHA-256 of the encrypted blob, base64 */
  encryptedHash: string;
  /** SHA-256 of the plaintext DB, base64 — verified after decrypt */
  plaintextHash: string;
  /** Size of the encrypted blob in bytes */
  encryptedSizeBytes: number;
  /** Size of the plaintext DB in bytes */
  plaintextSizeBytes: number;
  /** IV (nonce) for AES-256-GCM, base64 */
  iv: string;
  /** Auth tag from AES-256-GCM, base64 */
  authTag: string;
  /** Whether the key was derived from DPAPI (Windows) or a passphrase */
  keySource: 'dpapi' | 'passphrase' | 'env';
}

export interface BackupResult {
  manifest: BackupManifest;
  encryptedPath: string;    // path to the .enc file
  manifestPath: string;     // path to the manifest.json
}

export interface RestoreResult {
  restoredDbPath: string;
  verifiedHash: boolean;
  manifest: BackupManifest;
}

export interface BackupKeyDerivation {
  /** Derive a 256-bit key from a user passphrase using PBKDF2-SHA256 */
  fromPassphrase(passphrase: string, salt: Buffer): Promise<Buffer>;
  /** Use Windows DPAPI-protected key stored in the user profile */
  fromDPAPI(): Promise<Buffer | null>;
  /** Read key from BACKUP_ENCRYPT_KEY env var (hex-encoded 32 bytes) */
  fromEnv(): Buffer | null;
}

export interface EncryptedBackupCapability {
  /** Create an encrypted backup of the SQLite DB */
  backup(dbPath: string, outputDir: string): Promise<BackupResult>;
  /** Restore a DB from an encrypted backup */
  restore(manifestPath: string, targetDbPath: string): Promise<RestoreResult>;
  /** Verify backup integrity without restoring */
  verify(manifestPath: string): Promise<boolean>;
  /** List all backups in the given directory */
  list(backupDir: string): Promise<BackupManifest[]>;
}
