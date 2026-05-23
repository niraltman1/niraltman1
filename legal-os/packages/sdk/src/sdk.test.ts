import { describe, it, expect } from 'vitest';
import { validateManifest, isValidManifest, loadPlugin, unloadPlugin, listLoadedPlugins } from './index.js';
import type { PluginManifest } from './index.js';

const validManifest: PluginManifest = {
  name: 'test-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  capabilities: ['read:cases'],
};

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(validManifest)).toBeNull();
  });
  it('rejects non-object', () => {
    expect(validateManifest(null)).not.toBeNull();
    expect(validateManifest('string')).not.toBeNull();
  });
  it('rejects invalid name', () => {
    expect(validateManifest({ ...validManifest, name: 'Bad Name!' })).not.toBeNull();
  });
  it('rejects invalid version', () => {
    expect(validateManifest({ ...validManifest, version: 'latest' })).not.toBeNull();
  });
  it('rejects unknown capability', () => {
    expect(validateManifest({ ...validManifest, capabilities: ['hack:everything'] })).not.toBeNull();
  });
});

describe('loadPlugin', () => {
  it('loads a valid plugin and returns LoadedPlugin', () => {
    const loaded = loadPlugin(validManifest);
    expect(loaded.manifest.name).toBe('test-plugin');
    expect(loaded.context.capabilities.has('read:cases')).toBe(true);
    expect(listLoadedPlugins()).toContain('test-plugin');
    unloadPlugin('test-plugin');
    expect(listLoadedPlugins()).not.toContain('test-plugin');
  });
  it('throws on invalid manifest', () => {
    expect(() => loadPlugin({ name: 'bad!' })).toThrow();
  });
  it('filters capabilities by allowedCapabilities option', () => {
    const m: PluginManifest = { ...validManifest, name: 'filtered', capabilities: ['read:cases', 'write:cases'] };
    const loaded = loadPlugin(m, { allowedCapabilities: ['read:cases'] });
    expect(loaded.context.capabilities.has('read:cases')).toBe(true);
    expect(loaded.context.capabilities.has('write:cases')).toBe(false);
    unloadPlugin('filtered');
  });
});
