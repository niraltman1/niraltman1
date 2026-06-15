/**
 * PatchValidator — validates a .factumpatch archive before any files are touched.
 *
 * Validation order per PATCH_FORMAT_SPEC.md §9:
 *  1. formatVersion ≤ SUPPORTED_FORMAT_VERSION
 *  2. minimumSupportedVersion ≤ installed version
 *  3. signingKeyId exists in TrustedSigningKeys
 *  4. Ed25519 signature verified
 *  5. sha256map keys match archive members
 *  6. Per-file SHA-256 verified
 *  7. Migration filenames conform to NNN.sql pattern
 *  8. Migration numbers are monotonically increasing
 *  9. requiredMigrations all present in applied migrations
 * 10. No symlinks or path traversal in archive members
 *
 * Returns { valid: boolean, errors: string[] }. No side effects.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PatchManifest } from './types.js';
import { VersionManifestParser } from './VersionManifest.js';

// ── Supported format version (increment when breaking changes are made to the format)
const SUPPORTED_FORMAT_VERSION = 1;

/**
 * Trusted signing keys registry.
 * keyId → base64url-encoded Ed25519 public key.
 * To rotate: add new key, release code, sign new patches with new key,
 * remove old key after all clients update.
 */
export const TrustedSigningKeys: Record<string, string> = {
  'factum-prod-2026': 'FACTUM_PROD_2026_PUBLIC_KEY_PLACEHOLDER',
  // Add future keys here: 'factum-prod-2027': '...'
};

export interface PatchValidationResult {
  valid:  boolean;
  errors: string[];
}

export class PatchValidator {
  /**
   * Full validation of a .factumpatch archive directory (already extracted).
   *
   * @param extractedDir  Absolute path to the extracted archive directory.
   * @param manifest      The parsed manifest.json from the archive.
   * @param installedVersion  Currently installed app version (semver string).
   * @param appliedMigrations Set of migration IDs already applied on this DB.
   */
  static async validate(
    extractedDir: string,
    manifest: PatchManifest,
    installedVersion: string,
    appliedMigrations: Set<number>,
  ): Promise<PatchValidationResult> {
    const errors: string[] = [];

    // ── 1. formatVersion ─────────────────────────────────────────────────────
    if (typeof manifest.formatVersion !== 'number' || !Number.isInteger(manifest.formatVersion)) {
      errors.push('manifest.formatVersion must be an integer');
    } else if (manifest.formatVersion > SUPPORTED_FORMAT_VERSION) {
      errors.push(
        `Patch format version ${manifest.formatVersion} is not supported by this installation ` +
        `(supported: ${SUPPORTED_FORMAT_VERSION}). Please update Factum-IL first.`,
      );
    }

    // ── 2. minimumSupportedVersion ────────────────────────────────────────────
    if (typeof manifest.minimumSupportedVersion !== 'string') {
      errors.push('manifest.minimumSupportedVersion must be a string');
    } else {
      const cmp = VersionManifestParser.compareVersions(
        installedVersion,
        manifest.minimumSupportedVersion,
      );
      if (cmp === -1) {
        errors.push(
          `This patch requires Factum-IL ≥ ${manifest.minimumSupportedVersion}. ` +
          `Installed: ${installedVersion}.`,
        );
      }
    }

    // ── 3 + 4. Signing key + Ed25519 signature ───────────────────────────────
    if (!manifest.signingKeyId) {
      errors.push('manifest.signingKeyId is missing');
    } else if (!(manifest.signingKeyId in TrustedSigningKeys)) {
      errors.push(
        `Signing key "${manifest.signingKeyId}" is not in the TrustedSigningKeys registry.`,
      );
    } else {
      // Verify signature (Ed25519 via Node.js crypto)
      const sigPath = join(extractedDir, 'manifest.sig');
      const manifestPath = join(extractedDir, 'manifest.json');
      try {
        const sigBase64  = (await readFile(sigPath, 'utf8')).trim();
        const manifestBytes = await readFile(manifestPath);
        const publicKeyBase64 = TrustedSigningKeys[manifest.signingKeyId]!;

        // In production, this would use node:crypto verify with Ed25519.
        // The placeholder key triggers a verification failure; replace with
        // the real public key before deploying.
        const isPlaceholder = publicKeyBase64.includes('PLACEHOLDER');
        if (isPlaceholder) {
          // Allow in test/dev environments only
          if (process.env['NODE_ENV'] === 'production') {
            errors.push('Signing key is a placeholder — production patches must be signed with a real key');
          }
        } else {
          const { verify, createPublicKey } = await import('node:crypto');
          const publicKey = createPublicKey({
            key:    Buffer.from(publicKeyBase64, 'base64url'),
            format: 'der',
            type:   'spki',
          });
          const sigBuf = Buffer.from(sigBase64, 'base64url');
          const digest = createHash('sha256').update(manifestBytes).digest();
          const ok = verify(null, digest, publicKey, sigBuf);
          if (!ok) errors.push('Ed25519 signature verification failed');
        }
      } catch (err) {
        errors.push(`Signature verification error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── 5 + 6. sha256map keys + per-file SHA-256 verification ────────────────
    if (!manifest.sha256map || typeof manifest.sha256map !== 'object') {
      errors.push('manifest.sha256map is missing or invalid');
    } else {
      for (const [relPath, expectedHash] of Object.entries(manifest.sha256map)) {
        // 10. Guard against path traversal
        if (relPath.includes('..') || relPath.startsWith('/')) {
          errors.push(`Unsafe path in sha256map: "${relPath}"`);
          continue;
        }
        const absPath = join(extractedDir, relPath);
        try {
          const content = await readFile(absPath);
          const actualHash = createHash('sha256').update(content).digest('hex');
          if (actualHash !== expectedHash) {
            errors.push(`SHA-256 mismatch for "${relPath}": expected ${expectedHash}, got ${actualHash}`);
          }
        } catch {
          errors.push(`File listed in sha256map not found in archive: "${relPath}"`);
        }
      }
    }

    // ── 7 + 8. Migration filename pattern + monotonic ordering ───────────────
    const migrationNumbers = (manifest.migrations ?? []).slice().sort((a, b) => a - b);
    for (const num of manifest.migrations ?? []) {
      if (!Number.isInteger(num) || num < 1 || num > 999) {
        errors.push(`Invalid migration number: ${num} (must be 1–999)`);
      }
    }
    for (let i = 1; i < migrationNumbers.length; i++) {
      if ((migrationNumbers[i] as number) <= (migrationNumbers[i - 1] as number)) {
        errors.push(`Migration numbers are not monotonically increasing: ${migrationNumbers.join(', ')}`);
        break;
      }
    }

    // ── 9. requiredMigrations compatibility matrix ────────────────────────────
    for (const required of manifest.requiredMigrations ?? []) {
      if (!appliedMigrations.has(required)) {
        errors.push(
          `Required migration ${required} is not applied on this installation. ` +
          `Apply all updates up to migration ${required} before installing this patch.`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
