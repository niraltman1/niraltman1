import type { DocumentType, DocumentLanguage } from '@factum-il/shared';

export interface EnrichmentRequest {
  readonly documentId: number;
  readonly ocrText: string;
  readonly filename: string;
  readonly language: DocumentLanguage;
  /** Context is strictly isolated to a single client/case domain. */
  readonly isolationContext: {
    readonly clientId: number | null;
    readonly caseId: number | null;
  };
}

export interface EnrichmentResponse {
  readonly documentId: number;
  readonly modelName: string;
  readonly promptHash: string;
  readonly documentType: DocumentType | null;
  readonly documentDate: string | null;
  readonly suggestedCaseNumber: string | null;
  readonly suggestedClientName: string | null;
  readonly confidence: number;
  readonly fieldsEnriched: string[];
  readonly rawResponse: string;
}

export interface OllamaGenerateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly stream: false;
  readonly options?: {
    readonly temperature?: number;
    readonly num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  readonly model: string;
  readonly response: string;
  readonly done: boolean;
  readonly total_duration?: number;
}
