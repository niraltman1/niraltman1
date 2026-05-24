export type GuardrailStatus = 'pass' | 'warn' | 'fail';

export interface GuardrailResult {
  status:    GuardrailStatus;
  guardrail: string;    // name of the guardrail that ran
  message:   string;   // human-readable explanation
  details?:  unknown;  // optional structured details
}

export interface ExtractionPayload {
  caseNumber:    string | null;
  courtName:     string | null;
  judgeName:     string | null;
  offenseType:   string | null;
  charges:       string[];
  nextHearing:   string | null;
  procedureType: string | null;
  documentType:  string | null;
  confidence:    number;
}

export interface GuardrailContext {
  ocrText:    string;  // the source OCR text the AI processed
  documentId: number;
  caseId?:    number;
}
