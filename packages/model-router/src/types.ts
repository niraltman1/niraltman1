export type ModelCapability =
  | 'legal-reasoning'
  | 'embedding'
  | 'transcription'
  | 'vision-ocr'
  | 'reranking';

export interface ModelConfig {
  readonly id:           string;         // e.g. 'law-il-E2B'
  readonly ollamaName:   string;         // e.g. 'BrainboxAI/law-il-E2B:Q4_K_M'
  readonly baseUrl:      string;         // e.g. 'http://127.0.0.1:11434'
  readonly capabilities: readonly ModelCapability[];
  readonly required:     boolean;        // true = hard error if unavailable; false = skip gracefully
}

export interface RoutingContext {
  readonly task:        'enrich' | 'embed' | 'transcribe' | 'summarize' | 'rerank';
  readonly documentId?: number;
  readonly traceId?:    string;
}

/**
 * Structural type satisfied by ModelCircuitBreaker.
 * Defined here (rather than importing circuit-breaker.ts) to avoid circular imports.
 */
export interface RoutedModel {
  readonly config: ModelConfig;
  readonly circuitBreaker: {
    isOpen(): boolean;
    recordSuccess(): void;
    recordFailure(): void;
    status(): { open: boolean; failures: number; resetAt: string | null };
  };
}

export type RoutingResult =
  | { readonly ok: true;  readonly model: RoutedModel }
  | { readonly ok: false; readonly reason: string; readonly required: boolean };
