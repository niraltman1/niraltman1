export type {
  BackupEncryptionAlgorithm,
  BackupManifest,
  BackupResult,
  RestoreResult,
  BackupKeyDerivation,
  EncryptedBackupCapability,
} from './types.js';

export {
  deriveKeyFromPassphrase,
  keyFromEnv,
  encryptBuffer,
  decryptBuffer,
  encryptDb,
  decryptDb,
  verifyBackup,
  listBackups,
} from './BackupCrypto.js';
