export type CaseMemoryKind = 'entity' | 'risk' | 'reasoning' | 'summary' | 'citation' | 'timeline';

export interface CaseMemoryEntry {
  id:         number;
  caseId:     number;
  kind:       CaseMemoryKind;
  content:    string;
  confidence: number;
  agentName:  string;
  traceId:    string;
  createdAt:  string;
}

export interface UserPreference {
  userId:    string;
  key:       string;
  value:     string;
  updatedAt: string;
}

export interface AgentRun {
  id:         number;
  agentName:  string;
  traceId:    string;
  caseId:     number | null;
  status:     'started' | 'completed' | 'failed';
  durationMs: number | null;
  error:      string | null;
  startedAt:  string;
}
