export type {
  UserIdentity,
  EnterpriseRole,
  MultiUserCapability,
  StorageBackend,
  CentralizedStorageCapability,
  AdminConsoleCapability,
  EnterpriseBackupConfig,
  EnterpriseBackupCapability,
  FirmProfile,
  EnterpriseFeatureFlag,
  EnterpriseCapabilityRegistry,
} from './types.js';

export {
  createBetaCapabilityRegistry,
  getEnterpriseRegistry,
} from './BetaCapabilityRegistry.js';
