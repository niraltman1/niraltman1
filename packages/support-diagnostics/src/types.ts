// All diagnostic types for Factum-IL support bundles

export type DiagnosticSeverity = 'ok' | 'warn' | 'critical' | 'unknown';

export interface DiagnosticCheck {
  name: string;
  status: DiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

export interface SystemSnapshot {
  capturedAt: string;       // ISO8601
  traceId: string;
  appVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  osVersion: string;
  totalMemoryMB: number;
  freeMemoryMB: number;
  uptimeSeconds: number;
  factumRoot: string;
  dataPath: string;
  logPath: string;
}

export interface ModelInfo {
  required: string;
  present: boolean;
  source: 'local-gguf' | 'ollama-hub' | 'unknown';
  ggufPath?: string;
  ollamaReachable: boolean;
}

export interface MigrationState {
  appliedCount: number;
  lastMigration: string | null;
  expectedMinimum: number;
  healthy: boolean;
}

export interface CrashReport {
  id: string;             // UUID
  occurredAt: string;     // ISO8601
  traceId: string;
  source: 'api' | 'agent' | 'pipeline' | 'desktop' | 'startup';
  errorType: string;
  message: string;        // REDACTED of PII
  stack?: string;         // REDACTED of PII
  context: Record<string, unknown>;
  recovered: boolean;
}

export interface AgentExecutionSummary {
  recentFailures: number;
  recentSuccesses: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
}

export interface PipelineSummary {
  pendingCount: number;
  failedCount: number;
  lastProcessedAt: string | null;
  errorRate: number;
}

export interface SupportBundle {
  bundleId: string;
  generatedAt: string;
  system: SystemSnapshot;
  model: ModelInfo;
  migrations: MigrationState;
  health: {
    overall: DiagnosticSeverity;
    checks: DiagnosticCheck[];
  };
  agent: AgentExecutionSummary;
  pipeline: PipelineSummary;
  recentCrashes: CrashReport[];
  recentWarnings: string[];
  environmentVars: Record<string, string>;  // sanitized — no secrets
  installerDiagnostics: InstallerDiagnostics;
}

export interface InstallerDiagnostics {
  installedVersion: string;
  installPath: string;
  modelsPath: string;
  ggufPresent: boolean;
  ollamaPresent: boolean;
  webview2Present: boolean;
}

export interface DiagnosticsOptions {
  apiBaseUrl?: string;    // default: http://localhost:3001
  factumRoot?: string;    // from FACTUM_IL_ROOT env
  dataPath?: string;      // from FACTUM_IL_DATA_PATH env
  maxCrashAge?: number;   // hours, default 72
}
