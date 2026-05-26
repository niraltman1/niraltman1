export type WorkflowStage =
  | 'OCR_DONE' | 'ENTITY_EXTRACTION_DONE' | 'INDEXING_DONE'
  | 'MEMORY_WRITTEN' | 'READY_FOR_AGENTS';

export type WorkflowStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface WorkflowState {
  documentId: number;
  stage:      WorkflowStage;
  status:     WorkflowStatus;
  version:    number;
  updatedAt:  string;
}
