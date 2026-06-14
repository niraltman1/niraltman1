export { generateTraceId, runWithTrace, currentTraceId } from './correlation.js';
export { obsLogger } from './logger.js';
export type { ObservabilityLogMeta } from './logger.js';
export {
  MetricsStore,
  wireMetricsStore,
  recordWorkflowStageDuration,
  recordEventProcessingLag,
  incrementMemoryRejections,
  recordRetrievalCacheHit,
  incrementAgentRacePrevented,
  recordPatchApplyDuration,
  recordPatchRollbackDuration,
  recordGraphQueryDuration,
  recordGraphCacheHit,
  recordSupportExportDuration,
  recordRecoveryPointVerifyDuration,
} from './metrics-store.js';
export { observabilityMiddleware } from './middleware.js';
