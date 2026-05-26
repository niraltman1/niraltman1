// Update-core types — architecture hooks for future update infrastructure.
// No cloud calls. No actual update logic. Well-typed interfaces only.

export type UpdateChannel = 'beta' | 'stable' | 'enterprise';

export interface VersionManifest {
  /** Distribution channel this manifest belongs to */
  channel: UpdateChannel;

  /** Latest available version string (semver, e.g. "2.1.0") */
  latestVersion: string;

  /**
   * Minimum version that is still compatible.
   * Clients below this version must update immediately (forced update).
   */
  minCompatibleVersion: string;

  /** ISO8601 date of the release */
  releaseDate: string;

  /** Release notes — Hebrew-first, may include English below */
  releaseNotes: string;

  /**
   * URL to the installer binary (GitHub Releases asset).
   * Must be an HTTPS URL to a signed Factum-IL installer.
   */
  assetUrl: string;

  /** SHA-256 hex digest of the installer binary */
  sha256: string;

  /**
   * When true, this update must be applied immediately.
   * The UI must block usage until the update completes.
   */
  mandatory: boolean;
}

export interface RollbackMetadata {
  /** Version that was active before the update that triggered rollback readiness */
  previousVersion: string;

  /** ISO8601 timestamp when the previous version was installed */
  installedAt: string;

  /** Absolute path to the installer backup (kept for rollback) */
  installerPath: string;

  /** Absolute path to the SQLite database snapshot taken before the update */
  dbBackupPath: string;

  /** Whether the rollback artefacts are still present on disk */
  rollbackAvailable: boolean;
}

export interface UpdateState {
  /** Currently installed version string */
  currentVersion: string;

  /** Active update channel */
  channel: UpdateChannel;

  /**
   * ISO8601 timestamp of the last successful manifest check.
   * Null if a check has never been performed.
   */
  lastCheckedAt: string | null;

  /**
   * The manifest downloaded during the most recent check, if a newer version
   * is available.  Null if the current version is up-to-date.
   */
  pendingManifest: VersionManifest | null;

  /**
   * Rollback metadata from the previous update, if available.
   * Null if no rollback artefacts exist.
   */
  rollback: RollbackMetadata | null;

  /**
   * True while an update is being downloaded or applied.
   * Prevents concurrent update attempts.
   */
  updateInProgress: boolean;
}

export interface UpdateValidationResult {
  /** True only when all validation rules pass */
  valid: boolean;

  /** Blocking error messages that prevent the update from proceeding */
  errors: string[];

  /** Non-blocking warnings that the user should be aware of */
  warnings: string[];
}
