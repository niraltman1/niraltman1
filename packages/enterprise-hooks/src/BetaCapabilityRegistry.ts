import type {
  EnterpriseCapabilityRegistry,
  MultiUserCapability,
  CentralizedStorageCapability,
  AdminConsoleCapability,
  EnterpriseBackupCapability,
  FirmProfile,
} from './types.js';

/**
 * Beta-tier implementation of all enterprise capabilities.
 * Every capability is disabled — calling code can safely check isEnabled()
 * without needing to know whether enterprise mode is active.
 */

const disabledMultiUser: MultiUserCapability = {
  isEnabled: () => false,
  getCurrentUser: () => null,
  can: (_user, _action, _resourceId) => false,
};

const disabledStorage: CentralizedStorageCapability = {
  isEnabled: () => false,
  getBackend: () => ({ kind: 'local', rootPath: '', readOnly: false }),
  migrate: async () => { throw new Error('Centralized storage not available in beta tier'); },
};

const disabledAdminConsole: AdminConsoleCapability = {
  isEnabled: () => false,
  getConsoleUrl: () => null,
  listUsers: async () => [],
  setRole: async () => { throw new Error('Admin console not available in beta tier'); },
};

const disabledEnterpriseBackup: EnterpriseBackupCapability = {
  isEnabled: () => false,
  getConfig: () => null,
  triggerBackup: async () => { throw new Error('Enterprise backup not available in beta tier'); },
  listBackups: async () => [],
};

const betaFirmProfile: FirmProfile = {
  firmId: 'beta',
  displayName: 'Factum IL Beta',
  licenseType: 'beta',
  installedAt: new Date().toISOString(),
  maxUsers: 1,
  features: [],
};

/**
 * Returns the beta-tier capability registry.
 * All enterprise capabilities are disabled but safely callable.
 */
export function createBetaCapabilityRegistry(): EnterpriseCapabilityRegistry {
  return {
    multiUser: disabledMultiUser,
    centralizedStorage: disabledStorage,
    adminConsole: disabledAdminConsole,
    enterpriseBackup: disabledEnterpriseBackup,
    firm: betaFirmProfile,
  };
}

/** Singleton instance for use across the application. */
let _registry: EnterpriseCapabilityRegistry | null = null;

export function getEnterpriseRegistry(): EnterpriseCapabilityRegistry {
  if (!_registry) {
    _registry = createBetaCapabilityRegistry();
  }
  return _registry;
}
