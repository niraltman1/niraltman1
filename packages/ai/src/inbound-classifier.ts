import { getCircuitBreaker } from '@factum-il/model-router';
import { logger } from '@factum-il/shared';

const DEFAULT_OLLAMA_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL      = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const AGENT              = 'InboundClassifier';

export interface InboundClassification {
  urgency:    'urgent' | 'normal' | 'low';
  tags:       string[];  // up to 4 brief Hebrew topic strings
  confidence: number;
}

function buildPrompt(body: string, clientName: string | null): string {
  return [
    'You are a legal communication triage assistant for an Israeli law firm.',
    'Classify the inbound client message below.',
    'Respond ONLY with a valid JSON object with exactly these keys:',
    '  "urgency": one of "urgent"|"normal"|"low"',
    '  "tags": array of up to 4 brief Hebrew topic strings',
    '  "confidence": number 0.0–1.0',
    '',
    ...(clientName ? [`לקוח: ${clientName}`, ''] : []),
    '%%BEGIN_MESSAGE%%',
    body.slice(0, 500),
    '%%END_MESSAGE%%',
  ].join('\n');
}

/**
 * Classify an inbound legal communication using the local law-il-E2B model.
 * Returns null if Ollama is unreachable, the circuit breaker is open, or the
 * response cannot be parsed — callers must treat null as "no classification"
 * (graceful degradation per CLAUDE.md "AI steps must fail gracefully").
 */
export async function classifyInboundMessage(
  body: string,
  clientName: string | null = null,
  options: { baseUrl?: string; model?: string } = {},
): Promise<InboundClassification | null> {
  if (!body.trim()) return null;

  const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_URL;
  const model   = options.model   ?? DEFAULT_MODEL;

  const cb = getCircuitBreaker('law-il-E2B');
  if (cb.isOpen()) return null;

  try {
    const ping = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
    if (!ping.ok) return null;
  } catch {
    return null;
  }

  let raw: string;
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model, prompt: buildPrompt(body, clientName), stream: false,
        options: { temperature: 0.05, num_predict: 128 },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) { cb.recordFailure(); return null; }
    const data = await res.json() as { response?: string };
    raw = data.response ?? '';
  } catch {
    cb.recordFailure();
    return null;
  }

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const urgency = parsed['urgency'];
    if (urgency !== 'urgent' && urgency !== 'normal' && urgency !== 'low') return null;
    const tags = Array.isArray(parsed['tags'])
      ? (parsed['tags'] as unknown[]).filter((t) => typeof t === 'string').slice(0, 4) as string[]
      : [];
    const confidence = typeof parsed['confidence'] === 'number'
      ? Math.min(Math.max(parsed['confidence'], 0), 1) : 0.5;
    cb.recordSuccess();
    logger.debug(`Inbound classified: urgency=${urgency} tags=[${tags.join(',')}] conf=${confidence.toFixed(2)}`, {
      category: 'ai', agentSource: AGENT,
    });
    return { urgency, tags, confidence };
  } catch {
    return null;
  }
}
