import type { PluginManifest, PluginCapability } from './types.js';

const VALID_CAPABILITIES = new Set<PluginCapability>([
  'read:cases', 'read:documents', 'write:cases', 'write:documents',
  'read:clients', 'emit:events', 'call:ai',
]);

// Returns null if valid, or an error message string if invalid.
export function validateManifest(manifest: unknown): string | null {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return 'manifest must be a plain object';
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m['name'] !== 'string' || m['name'].length === 0) {
    return 'manifest.name must be a non-empty string';
  }
  if (!/^[a-z][a-z0-9-]*$/.test(m['name'])) {
    return `manifest.name must be kebab-case (^[a-z][a-z0-9-]*$), got: ${m['name']}`;
  }

  if (typeof m['version'] !== 'string' || m['version'].length === 0) {
    return 'manifest.version must be a non-empty string';
  }
  if (!/^\d+\.\d+\.\d+$/.test(m['version'])) {
    return `manifest.version must be semver-like (^\\d+\\.\\d+\\.\\d+$), got: ${m['version']}`;
  }

  if (typeof m['description'] !== 'string') {
    return 'manifest.description must be a string';
  }

  if (!Array.isArray(m['capabilities']) || m['capabilities'].length === 0) {
    return 'manifest.capabilities must be a non-empty array';
  }

  for (const cap of m['capabilities']) {
    if (!VALID_CAPABILITIES.has(cap as PluginCapability)) {
      return `unknown capability: ${String(cap)}`;
    }
  }

  return null;
}

// Returns true if manifest is valid (calls validateManifest internally)
export function isValidManifest(manifest: unknown): manifest is PluginManifest {
  return validateManifest(manifest) === null;
}
