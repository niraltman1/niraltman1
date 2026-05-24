export type PolicyDecision = 'allow' | 'deny' | 'require_review';

export interface MemoryWriteRequest {
  kind:       'FACT' | 'AI_SUMMARY' | 'AI_HYPOTHESIS';
  confidence: number;
  content:    string;
}

export interface AgentRunRequest {
  agentType:  string;
  caseId:     number | null;
  documentId: number | null;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason:   string;
}
