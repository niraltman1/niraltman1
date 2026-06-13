// Public API for @factum-il/support-diagnostics

export type {
  DiagnosticSeverity,
  DiagnosticCheck,
  SystemSnapshot,
  ModelInfo,
  MigrationState,
  CrashReport,
  AgentExecutionSummary,
  PipelineSummary,
  SupportBundle,
  InstallerDiagnostics,
  DiagnosticsOptions,
} from './types.js';

export { RedactionPipeline }   from './RedactionPipeline.js';
export { CrashReporter }       from './CrashReporter.js';
export { EnvironmentSnapshot } from './EnvironmentSnapshot.js';
export { DiagnosticsCollector } from './DiagnosticsCollector.js';
export { SupportBundleExporter } from './SupportBundleExporter.js';

export type { RepairAction, RepairSeverity, RepairRecommendation, RecommendationsInput } from './RepairRecommendationsEngine.js';
export { RepairRecommendationsEngine } from './RepairRecommendationsEngine.js';

export type { HealResult } from './SelfHealingActions.js';
export { SelfHealingActions } from './SelfHealingActions.js';
