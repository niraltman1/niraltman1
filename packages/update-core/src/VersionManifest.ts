/**
 * VersionManifestParser — parses and compares version manifests.
 *
 * All methods are static and pure — no I/O, no side effects.
 */

import type { VersionManifest } from './types.js';

/** Ordered list of update channels from least to most stable */
const VALID_CHANNELS = new Set(['beta', 'stable', 'enterprise']);

/** Semver pattern — accepts MAJOR.MINOR.PATCH with optional pre-release */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/;

export class VersionManifestParser {
  // ---------------------------------------------------------------------------
  // Parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a raw (untrusted) value into a `VersionManifest`.
   * Returns `null` if any required field is missing or has the wrong type.
   * This is the only place where `unknown` input is accepted; callers work with
   * the typed result.
   */
  static parse(raw: unknown): VersionManifest | null {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;

    // Cast to a loose record for field extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = raw as Record<string, any>;

    const channel             = obj['channel'];
    const latestVersion       = obj['latestVersion'];
    const minCompatibleVersion = obj['minCompatibleVersion'];
    const releaseDate         = obj['releaseDate'];
    const releaseNotes        = obj['releaseNotes'];
    const assetUrl            = obj['assetUrl'];
    const sha256              = obj['sha256'];
    const mandatory           = obj['mandatory'];

    // Type guards
    if (!VALID_CHANNELS.has(channel as string))              return null;
    if (typeof latestVersion !== 'string')                   return null;
    if (!SEMVER_RE.test(latestVersion))                      return null;
    if (typeof minCompatibleVersion !== 'string')            return null;
    if (!SEMVER_RE.test(minCompatibleVersion))               return null;
    if (typeof releaseDate !== 'string')                     return null;
    if (typeof releaseNotes !== 'string')                    return null;
    if (typeof assetUrl !== 'string')                        return null;
    if (!assetUrl.startsWith('https://'))                    return null;
    if (typeof sha256 !== 'string' || sha256.length !== 64) return null;
    if (typeof mandatory !== 'boolean')                      return null;

    return {
      channel:              channel as VersionManifest['channel'],
      latestVersion,
      minCompatibleVersion,
      releaseDate,
      releaseNotes,
      assetUrl,
      sha256,
      mandatory,
    };
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  /**
   * Compares two semver strings lexicographically by numeric component.
   * Pre-release suffixes (e.g. `-beta.1`) are compared as strings after the
   * numeric part, with no pre-release considered greater than any pre-release.
   *
   * Returns:
   *   -1  →  a < b
   *    0  →  a === b
   *    1  →  a > b
   */
  static compareVersions(a: string, b: string): -1 | 0 | 1 {
    const parseVersion = (v: string): { nums: number[]; pre: string | null } => {
      const [numPart, pre] = v.split('-', 2) as [string, string | undefined];
      const nums = (numPart ?? '').split('.').map((n) => parseInt(n, 10));
      return { nums, pre: pre ?? null };
    };

    const av = parseVersion(a);
    const bv = parseVersion(b);

    // Compare numeric parts
    const len = Math.max(av.nums.length, bv.nums.length);
    for (let i = 0; i < len; i++) {
      const an = av.nums[i] ?? 0;
      const bn = bv.nums[i] ?? 0;
      if (an < bn) return -1;
      if (an > bn) return 1;
    }

    // Numeric parts are equal — compare pre-release
    // No pre-release > any pre-release (stable > beta)
    if (av.pre === null && bv.pre === null) return 0;
    if (av.pre === null) return 1;   // a is stable, b has pre-release
    if (bv.pre === null) return -1;  // b is stable, a has pre-release

    // Both have pre-release — lexicographic compare
    if (av.pre < bv.pre) return -1;
    if (av.pre > bv.pre) return 1;
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Business rules
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the current version is below the manifest's
   * `minCompatibleVersion`, meaning the update is mandatory.
   */
  static isMandatoryUpdate(
    manifest: VersionManifest,
    currentVersion: string,
  ): boolean {
    const comparison = VersionManifestParser.compareVersions(
      currentVersion,
      manifest.minCompatibleVersion,
    );
    // currentVersion < minCompatibleVersion → must update
    return comparison === -1;
  }
}
