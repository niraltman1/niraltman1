export interface DbHandle {
  prepare(sql: string): {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number };
  };
}

export interface ProceduralStep {
  stepName:    string;
  status:      'pending' | 'complete' | 'missing' | 'overdue';
  dueDate:     string | null;
  completedAt: string | null;
  notes:       string | null;
  ruleId:      number | null;
}

export interface CompletenessReport {
  caseId:        number;
  totalSteps:    number;
  completeSteps: number;
  missingSteps:  ProceduralStep[];
  overdueSteps:  ProceduralStep[];
  score:         number;  // 0.0–1.0
}

export interface RiskFactor {
  factor:      string;
  severity:    'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface RiskScore {
  caseId:      number;
  score:       number;  // 0.0–1.0 (1=highest risk)
  factors:     RiskFactor[];
  agentName:   string;
  traceId:     string;
}

export interface EvidenceGap {
  claimDescription: string;
  missingEvidenceKind: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ContradictionFinding {
  documentIdA:  number;
  documentIdB:  number;
  description:  string;
  confidence:   number;
}
