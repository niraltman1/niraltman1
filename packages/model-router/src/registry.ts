import { ModelCircuitBreaker } from './circuit-breaker.js';
import type { ModelConfig, RoutedModel } from './types.js';

const OLLAMA_BASE_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';

/**
 * Canonical model registry.
 *
 * CRITICAL: law-il-E2B is the ONLY required model and the ONLY model for
 * legal-reasoning tasks. Per CLAUDE.md, no other model may be used for
 * Israeli legal reasoning — it would produce wrong, untested, and potentially
 * harmful legal output.
 */
export const MODEL_CONFIGS: readonly ModelConfig[] = [
  {
    id:           'law-il-E2B',
    ollamaName:   process.env['OLLAMA_MODEL'] ?? 'BrainboxAI/law-il-E2B:Q4_K_M',
    baseUrl:      OLLAMA_BASE_URL,
    capabilities: ['legal-reasoning'],
    required:     true,
  },
  {
    id:           'nomic-embed-text',
    ollamaName:   'nomic-embed-text',
    baseUrl:      OLLAMA_BASE_URL,
    capabilities: ['embedding'],
    required:     false,
  },
  {
    id:           'faster-whisper',
    ollamaName:   'faster-whisper',
    baseUrl:      OLLAMA_BASE_URL,
    capabilities: ['transcription'],
    required:     false,
  },
] as const;

// Singleton registry: one CircuitBreaker per model ID.
const breakers = new Map<string, ModelCircuitBreaker>(
  MODEL_CONFIGS.map((c) => [c.id, new ModelCircuitBreaker(c.id)]),
);

export function getCircuitBreaker(modelId: string): ModelCircuitBreaker {
  const existing = breakers.get(modelId);
  if (existing !== undefined) return existing;

  // Unknown model — create a breaker on demand.
  const newCb = new ModelCircuitBreaker(modelId);
  breakers.set(modelId, newCb);
  return newCb;
}

export function getRoutedModel(modelId: string): RoutedModel | null {
  const config = MODEL_CONFIGS.find((c) => c.id === modelId);
  if (config === undefined) return null;
  return { config, circuitBreaker: getCircuitBreaker(modelId) };
}

export function allModelStatuses(): Array<{
  modelId:       string;
  required:      boolean;
  circuitStatus: ReturnType<ModelCircuitBreaker['status']>;
}> {
  return MODEL_CONFIGS.map((c) => ({
    modelId:       c.id,
    required:      c.required,
    circuitStatus: getCircuitBreaker(c.id).status(),
  }));
}
