import type { PluginManifest, LoadedPlugin, PluginContext } from './types.js';
import { isValidManifest, validateManifest } from './plugin-manifest.js';
import { extensionPoints } from './extension-points.js';

export interface LoaderOptions {
  // If provided, plugin capabilities are filtered to only those in this allowed set.
  // Use this to sandbox plugins (e.g. read-only plugins cannot write).
  allowedCapabilities?: readonly string[];
}

// Loads a plugin manifest, validates it, registers hooks, and returns the LoadedPlugin.
// Throws if the manifest is invalid.
// Plugin is sandboxed to only its declared (and allowed) capabilities.
export function loadPlugin(
  manifest: unknown,
  opts: LoaderOptions = {},
): LoadedPlugin {
  if (!isValidManifest(manifest)) {
    const err = validateManifest(manifest);
    throw new Error(`Invalid plugin manifest: ${err}`);
  }

  // Build capability set, filtered by allowedCapabilities if provided
  const grantedCaps = manifest.capabilities.filter((c) =>
    !opts.allowedCapabilities || opts.allowedCapabilities.includes(c),
  );

  const context: PluginContext = {
    pluginName:   manifest.name,
    capabilities: new Set(grantedCaps),
    ...(grantedCaps.includes('emit:events')
      ? { emitEvent: (_type: string, _payload: Record<string, unknown>) => { /* no-op stub — real impl wired by host */ } }
      : {}),
  };

  // Register hooks if plugin provided them; always track the plugin name
  if (manifest.hooks) {
    extensionPoints.register(manifest.name, manifest.hooks);
  } else {
    extensionPoints.registerName(manifest.name);
  }

  return { manifest, context };
}

// Unloads a plugin (unregisters its hooks)
export function unloadPlugin(pluginName: string): void {
  extensionPoints.unregister(pluginName);
}

// List all currently loaded plugin names
export function listLoadedPlugins(): string[] {
  return extensionPoints.listPlugins();
}
