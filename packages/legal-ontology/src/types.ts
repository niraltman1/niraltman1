export type EntityKind =
  | 'Person' | 'Attorney' | 'Company'
  | 'Court' | 'Judge' | 'Case'
  | 'Statute' | 'Decision' | 'Citation'
  | 'Evidence' | 'Hearing' | 'Motion'
  | 'Deadline' | 'Contract' | 'Clause' | 'Party';

export interface LegalEntity {
  id:         number;
  kind:       EntityKind;
  canonical:  string;
  aliases:    string[];
  caseId:     number | null;
  documentId: number | null;
}

export interface CourtLevel {
  id:   string;
  name: string;
  rank: number;
}
