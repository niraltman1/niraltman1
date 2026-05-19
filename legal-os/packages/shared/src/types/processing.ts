/** All valid document processing states in the Legal-OS state machine. */
export type ProcessingState =
  | 'DISCOVERED'
  | 'HASHED'
  | 'OCR_PENDING'
  | 'OCR_COMPLETE'
  | 'CLASSIFIED'
  | 'ENRICHED'
  | 'REVIEW_PENDING'
  | 'APPLIED'
  | 'VERIFIED'
  | 'FAILED'
  | 'ROLLED_BACK';

/** Possible agents that perform state transitions. */
export type AgentName =
  | 'GovernanceController'
  | 'Provisioner'
  | 'PipelineEngine'
  | 'AIStrategist'
  | 'DataArchitect'
  | 'UIUXLead'
  | 'QASyncOrchestrator'
  | 'ManualReview'
  | 'System';

export interface ProcessingStatusRecord {
  readonly id: number;
  readonly documentId: number;
  readonly fromState: ProcessingState;
  readonly toState: ProcessingState;
  readonly agent: AgentName;
  readonly success: boolean;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly transitionedAt: string;
}

export interface ActionLogRecord {
  readonly id: number;
  readonly operationId: string;
  readonly operationType: ActionLogOperationType;
  readonly documentId: number | null;
  readonly agent: AgentName;
  readonly fileHashBefore: string | null;
  readonly fileHashAfter: string | null;
  readonly pathBefore: string | null;
  readonly pathAfter: string | null;
  readonly metadataJson: string | null;
  readonly isReversible: boolean;
  readonly rolledBack: boolean;
  readonly rollbackActionId: number | null;
  readonly loggedAt: string;
}

export type ActionLogOperationType =
  | 'MOVE'
  | 'RENAME'
  | 'OCR'
  | 'ENRICH'
  | 'CLASSIFY'
  | 'HASH'
  | 'ROLLBACK'
  | 'SNAPSHOT'
  | 'INDEX'
  | 'IMPORT';

export interface ManifestSnapshotRecord {
  readonly id: number;
  readonly snapshotId: string;
  readonly documentId: number;
  readonly snapshotData: string;
  readonly fileHash: string;
  readonly originalPath: string;
  readonly storagePath: string;
  readonly originalMtime: string | null;
  readonly originalSize: number;
  readonly triggerEvent: string;
  readonly createdAt: string;
}

export interface AIEnrichmentRecord {
  readonly id: number;
  readonly documentId: number;
  readonly modelName: string;
  readonly promptHash: string;
  readonly responseJson: string;
  readonly confidence: number;
  readonly fieldsEnriched: string[];
  readonly validated: boolean;
  readonly applied: boolean;
  readonly enrichedAt: string;
}

export interface ConfidenceScore {
  readonly total: number;
  readonly ocrQuality: number;
  readonly regexCertainty: number;
  readonly aiConsistency: number;
  readonly crossDocumentValidation: number;
  readonly metadataCompleteness: number;
  readonly meetsThreshold: boolean;
}

export const CONFIDENCE_THRESHOLD = 0.75;
