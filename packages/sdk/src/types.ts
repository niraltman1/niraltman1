// Capability a plugin declares it needs. Loader uses this to grant/deny access.
export type PluginCapability =
  | 'read:cases'
  | 'read:documents'
  | 'write:cases'
  | 'write:documents'
  | 'read:clients'
  | 'emit:events'
  | 'call:ai';

// Plugin lifecycle hooks
export interface PluginHooks {
  onDocumentIngested?: (documentId: number) => Promise<void>;
  onCaseCreated?:     (caseId: number)     => Promise<void>;
  onCaseUpdated?:     (caseId: number)     => Promise<void>;
  onAgentCompleted?:  (traceId: string)    => Promise<void>;
}

// Manifest every plugin must export as default
export interface PluginManifest {
  readonly name:         string;        // unique kebab-case identifier
  readonly version:      string;        // semver
  readonly description:  string;
  readonly capabilities: PluginCapability[];
  hooks?: PluginHooks;
}

// Runtime context passed to plugin hooks
export interface PluginContext {
  readonly pluginName: string;
  readonly capabilities: ReadonlySet<PluginCapability>;
  // emitEvent is only available if plugin declared 'emit:events' capability
  emitEvent?: (type: string, payload: Record<string, unknown>) => void;
}

// Result from loading a plugin
export interface LoadedPlugin {
  readonly manifest: PluginManifest;
  readonly context:  PluginContext;
}
