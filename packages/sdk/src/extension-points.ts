import type { PluginHooks } from './types.js';

// Singleton registry of all active plugin hooks
export class ExtensionPointRegistry {
  private readonly hooks = new Map<string, PluginHooks>();
  // Tracks all registered plugin names (including those with no hooks)
  private readonly registered = new Set<string>();

  register(pluginName: string, hooks: PluginHooks): void {
    this.hooks.set(pluginName, hooks);
    this.registered.add(pluginName);
  }

  registerName(pluginName: string): void {
    this.registered.add(pluginName);
  }

  unregister(pluginName: string): void {
    this.hooks.delete(pluginName);
    this.registered.delete(pluginName);
  }

  // Fire onDocumentIngested across all registered plugins (errors are caught per-plugin)
  async fireDocumentIngested(documentId: number): Promise<void> {
    for (const [, h] of this.hooks) {
      if (h.onDocumentIngested) {
        await h.onDocumentIngested(documentId).catch(() => {});
      }
    }
  }

  async fireCaseCreated(caseId: number): Promise<void> {
    for (const [, h] of this.hooks) {
      if (h.onCaseCreated) {
        await h.onCaseCreated(caseId).catch(() => {});
      }
    }
  }

  async fireCaseUpdated(caseId: number): Promise<void> {
    for (const [, h] of this.hooks) {
      if (h.onCaseUpdated) {
        await h.onCaseUpdated(caseId).catch(() => {});
      }
    }
  }

  async fireAgentCompleted(traceId: string): Promise<void> {
    for (const [, h] of this.hooks) {
      if (h.onAgentCompleted) {
        await h.onAgentCompleted(traceId).catch(() => {});
      }
    }
  }

  listPlugins(): string[] {
    return [...this.registered];
  }
}

// Shared singleton instance
export const extensionPoints = new ExtensionPointRegistry();
