export type { PluginCapability, PluginHooks, PluginManifest, PluginContext, LoadedPlugin } from './types.js';
export { validateManifest, isValidManifest } from './plugin-manifest.js';
export { ExtensionPointRegistry, extensionPoints } from './extension-points.js';
export { loadPlugin, unloadPlugin, listLoadedPlugins } from './loader.js';
export type { LoaderOptions } from './loader.js';
