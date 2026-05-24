// Base fields on every domain event
export interface BaseEvent {
  readonly traceId:    string;
  readonly occurredAt: string;
}

// All domain events as a discriminated union
export type DomainEvent = BaseEvent & (
  | { readonly kind: 'DocumentUploaded';     readonly documentId: number; readonly filePath: string }
  | { readonly kind: 'OCRCompleted';         readonly documentId: number; readonly caseId: number | null; readonly ocrTextLength: number }
  | { readonly kind: 'OCRFailed';            readonly documentId: number; readonly reason: string }
  | { readonly kind: 'EmbeddingGenerated';   readonly documentId: number; readonly chunkCount: number }
  | { readonly kind: 'EntitiesExtracted';    readonly documentId: number; readonly caseId: number | null }
  | { readonly kind: 'CitationParsed';       readonly documentId: number; readonly citationCount: number }
  | { readonly kind: 'CaseUpdated';          readonly caseId: number }
  | { readonly kind: 'RiskDetected';         readonly caseId: number; readonly riskType: string; readonly severity: 'low' | 'medium' | 'high' }
  | { readonly kind: 'DeadlineDetected';     readonly caseId: number; readonly deadlineDate: string }
  | { readonly kind: 'TimelineGenerated';    readonly caseId: number; readonly eventCount: number }
  | { readonly kind: 'AgentStarted';         readonly agentName: string; readonly caseId: number | null }
  | { readonly kind: 'AgentCompleted';       readonly agentName: string; readonly durationMs: number }
  | { readonly kind: 'AgentFailed';          readonly agentName: string; readonly reason: string }
  | { readonly kind: 'ComplianceFlagRaised'; readonly documentId: number; readonly flagType: string }
  | { readonly kind: 'EvidenceAdded';        readonly documentId: number; readonly caseId: number }
  | { readonly kind: 'ConflictDetected';     readonly caseId: number; readonly conflictType: string }
);

export type EventKind = DomainEvent['kind'];

export type EventOfKind<K extends EventKind> = Extract<DomainEvent, { kind: K }>;
