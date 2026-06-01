import { randomUUID } from 'node:crypto';
import type { AgentInput, AgentOutput } from './types.js';
import { runTools } from './tool-runner.js';
import { buildPrompt, SYSTEM_PROMPT } from './prompt-builder.js';
import { callOllama } from './ollama-caller.js';

const DEFAULT_OLLAMA_BASE = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL       = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
const DEFAULT_TIMEOUT_MS  = 60_000;

// Extract confidence from model response JSON if present
function extractConfidence(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const conf = parsed['confidence'] ?? parsed['ביטחון'];
    if (typeof conf === 'number') return Math.max(0, Math.min(1, conf));
  } catch { /* not JSON */ }
  return 0.7; // default mid-confidence
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const traceId    = input.traceId ?? randomUUID();
  const startTime  = Date.now();
  const report     = input.onProgress ?? (() => { /* no-op */ });

  // Step 1: execute all tools in parallel
  report({ stage: 'gathering', pct: 15, message: 'אוסף נתוני תיק…' });
  const toolResults = await runTools(input.tools);

  // Step 2: build prompt from gathered data
  report({ stage: 'context', pct: 35, message: 'בונה הקשר משפטי…' });
  const userPrompt = buildPrompt(input.task, toolResults, input.context);

  // Step 3: call law-il-E2B
  const config = {
    baseUrl:   DEFAULT_OLLAMA_BASE,
    model:     DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  report({ stage: 'analyzing', pct: 55, message: 'מנתח עם law-il-E2B…' });
  const rawResponse = await callOllama(userPrompt, config, SYSTEM_PROMPT);
  const ollamaAvailable = rawResponse !== null;

  report({ stage: 'validating', pct: 85, message: 'בודק ביטחון ותקינות…' });

  const result     = rawResponse ?? 'לא ניתן להשלים את הפעולה — Ollama אינו זמין כרגע';
  const confidence = ollamaAvailable ? extractConfidence(result) : 0;

  return {
    agentName:       input.agentName,
    traceId,
    result,
    confidence,
    toolResults,
    flagForReview:   !ollamaAvailable || confidence < 0.6,
    durationMs:      Date.now() - startTime,
    ollamaAvailable,
  };
}
