export interface GoldenDocument {
  id:           string;
  description:  string;         // human-readable, e.g. "ת"פ criminal summons"
  ocrText:      string;         // synthetic OCR text (Hebrew)
  expected: {
    caseNumber:    string | null;
    courtName:     string | null;
    judgeName:     string | null;
    documentType:  string | null;
    procedureType: string | null;
    citationCount: number;
    charges:       string[];
  };
}

export interface ExtractionResult {
  caseNumber:    string | null;
  courtName:     string | null;
  judgeName:     string | null;
  documentType:  string | null;
  procedureType: string | null;
  charges:       string[];
  confidence:    number;
}

export interface EvalMetrics {
  precision:        number;  // 0.0–1.0
  recall:           number;  // 0.0–1.0
  f1:               number;
  hallucinations:   number;  // count of values present in result but NOT in OCR text
  lowConfidence:    number;  // count of results with confidence < 0.7
  totalDocuments:   number;
}

export interface EvalReport {
  runAt:     string;          // ISO timestamp
  metrics:   EvalMetrics;
  failures:  EvalFailure[];
}

export interface EvalFailure {
  documentId: string;
  field:      string;
  expected:   unknown;
  actual:     unknown;
  reason:     string;
}
