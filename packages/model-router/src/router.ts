import type { ModelCapability, RoutingContext, RoutingResult } from './types.js';
import { MODEL_CONFIGS, getRoutedModel } from './registry.js';

// Task → required capability mapping.
const TASK_CAPABILITY: Record<RoutingContext['task'], ModelCapability> = {
  enrich:    'legal-reasoning',
  summarize: 'legal-reasoning',
  embed:     'embedding',
  transcribe:'transcription',
  rerank:    'reranking',
};

/**
 * Route a RoutingContext to the appropriate RoutedModel.
 *
 * For legal-reasoning tasks ('enrich', 'summarize'), this will always resolve
 * to law-il-E2B — the only registered model for that capability. If its
 * circuit is open, the result is ok:false with required:true so callers can
 * surface a hard error rather than silently skipping.
 *
 * For optional capabilities ('embedding', 'transcription', 'reranking'), a
 * circuit-open or missing model returns ok:false with required:false so
 * callers can degrade gracefully.
 */
export function selectModel(ctx: RoutingContext): RoutingResult {
  const capability = TASK_CAPABILITY[ctx.task];

  // Find the first model registered for the required capability.
  const candidate = MODEL_CONFIGS.find(
    (c) => (c.capabilities as readonly ModelCapability[]).includes(capability),
  );

  if (candidate === undefined) {
    return {
      ok:       false,
      reason:   `No model registered for capability: ${capability}`,
      required: false,
    };
  }

  const routed = getRoutedModel(candidate.id);
  if (routed === null) {
    return {
      ok:       false,
      reason:   `Model not found in registry: ${candidate.id}`,
      required: candidate.required,
    };
  }

  if (routed.circuitBreaker.isOpen()) {
    return {
      ok:       false,
      reason:   `Circuit open for model ${candidate.id}`,
      required: candidate.required,
    };
  }

  return { ok: true, model: routed };
}
