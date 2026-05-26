/**
 * Enterprise readiness extension points.
 * These are ARCHITECTURE-ONLY interfaces — no implementation yet.
 * They define the capability boundaries for a future enterprise tier.
 */

// ── Multi-user ─────────────────────────────────────────────────────────────────

export interface UserIdentity {
  userId: string;
  displayName: string;       // Hebrew-safe
  role: EnterpriseRole;
  firmId: string;
}

export type EnterpriseRole =
  | 'admin'        // full access + user management
  | 'attorney'     // case access per assignment
  | 'paralegal'    // read + document upload
  | 'readonly';    // read only

export interface MultiUserCapability {
  /** Returns true when enterprise multi-user mode is active. */
  isEnabled(): boolean;

  /** Resolve the current user from session context. */
  getCurrentUser(): UserIdentity | null;

  /** Check whether the current user can perform an action on a resource. */
  can(user: UserIdentity, action: string, resourceId?: string): boolean;
}

// ── Centralized storage ────────────────────────────────────────────────────────

export interface StorageBackend {
  kind: 'local' | 'network-drive' | 'enterprise-nas';
  rootPath: string;
  readOnly: boolean;
}

export interface CentralizedStorageCapability {
  isEnabled(): boolean;
  getBackend(): StorageBackend;
  /** Migrate from local SQLite path to a new storage backend. */
  migrate(target: StorageBackend): Promise<void>;
}

// ── Admin console ──────────────────────────────────────────────────────────────

export interface AdminConsoleCapability {
  isEnabled(): boolean;
  /** Returns the URL of the admin console (may be a local port). */
  getConsoleUrl(): string | null;
  /** List all registered users. */
  listUsers(): Promise<UserIdentity[]>;
  /** Promote or demote a user's role. */
  setRole(userId: string, role: EnterpriseRole): Promise<void>;
}

// ── Enterprise backup ──────────────────────────────────────────────────────────

export interface EnterpriseBackupConfig {
  schedule: 'daily' | 'weekly' | 'manual';
  destination: 'local' | 'network-drive';
  destinationPath: string;
  encryptionEnabled: boolean;
  retentionDays: number;
}

export interface EnterpriseBackupCapability {
  isEnabled(): boolean;
  getConfig(): EnterpriseBackupConfig | null;
  triggerBackup(): Promise<string>; // returns backup file path
  listBackups(): Promise<string[]>;
}

// ── Organization management ────────────────────────────────────────────────────

export interface FirmProfile {
  firmId: string;
  displayName: string;   // Hebrew firm name
  licenseType: 'beta' | 'standard' | 'enterprise';
  installedAt: string;   // ISO8601
  maxUsers: number;
  features: EnterpriseFeatureFlag[];
}

export type EnterpriseFeatureFlag =
  | 'multi-user'
  | 'centralized-storage'
  | 'admin-console'
  | 'enterprise-backup'
  | 'audit-export'
  | 'sso';

// ── Capability registry ────────────────────────────────────────────────────────

/**
 * Central registry of all enterprise capabilities.
 * At beta tier, all capabilities return isEnabled() = false.
 * This allows the codebase to call capability checks without crashing.
 */
export interface EnterpriseCapabilityRegistry {
  multiUser: MultiUserCapability;
  centralizedStorage: CentralizedStorageCapability;
  adminConsole: AdminConsoleCapability;
  enterpriseBackup: EnterpriseBackupCapability;
  firm: FirmProfile | null;
}
