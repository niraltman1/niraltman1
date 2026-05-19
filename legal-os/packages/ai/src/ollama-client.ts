import { createHash } from 'node:crypto';
import { logger, clamp, roundConfidence } from '@factum-il/shared';
import type {
  EnrichmentRequest,
  EnrichmentResponse,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
} from './types.js';

const DEFAULT_MODEL        = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
const DEFAULT_OLLAMA_URL   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const CONFIDENCE_FLOOR     = 0.0;
const CONFIDENCE_CEILING   = 1.0;
const CONNECT_TIMEOUT_MS   = 5_000;
const REQUEST_TIMEOUT_MS   = 45_000;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_RESET_MS     = 60_000;

// ── Circuit Breaker (module-level, shared across all OllamaClient instances) ──
let _circuitFailures  = 0;
let _circuitOpenedAt  = 0;

function isCircuitOpen(): boolean {
  if (_circuitFailures < CIRCUIT_FAILURE_LIMIT) return false;
  if (Date.now() - _circuitOpenedAt > CIRCUIT_RESET_MS) {
    _circuitFailures = 0; // half-open: allow one probe
    return false;
  }
  return true;
}

function recordCircuitSuccess(): void { _circuitFailures = 0; }
function recordCircuitFailure(): void {
  _circuitFailures++;
  if (_circuitFailures >= CIRCUIT_FAILURE_LIMIT) _circuitOpenedAt = Date.now();
}

/**
 * Thin HTTP client for the local Ollama API.
 * Never contacts external services.
 * Each enrichment call is isolated to a single document context.
 * Includes connection/read timeouts and a module-level circuit breaker.
 */
export class OllamaClient {
  private readonly baseUrl: string;
  private readonly modelName: string;

  constructor(options: { baseUrl?: string; modelName?: string } = {}) {
    this.baseUrl   = options.baseUrl   ?? DEFAULT_OLLAMA_URL;
    this.modelName = options.modelName ?? DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async enrich(request: EnrichmentRequest): Promise<EnrichmentResponse> {
    if (isCircuitOpen()) {
      throw new Error('Ollama circuit breaker open — skipping enrichment until service recovers');
    }

    const prompt     = this.buildPrompt(request);
    const promptHash = createHash('sha256').update(prompt, 'utf-8').digest('hex');

    logger.info(`AI enrichment requested for doc=${request.documentId}`, {
      category: 'ai',
      agentSource: 'AIStrategist',
    });

    const body: OllamaGenerateRequest = {
      model:  this.modelName,
      prompt,
      stream: false,
      options: { temperature: 0.1, repeat_penalty: 1.05, num_predict: 512 },
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      recordCircuitFailure();
      throw new Error(`Ollama connection failed: ${String(e)}`);
    }

    if (!res.ok) {
      recordCircuitFailure();
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    recordCircuitSuccess();
    const data = await res.json() as OllamaGenerateResponse;
    return this.parseResponse(request, promptHash, data.response);
  }

  private buildPrompt(req: EnrichmentRequest): string {
    return [
      'You are a legal document classification assistant for Israeli law.',
      'Respond ONLY with a valid JSON object containing exactly these keys:',
      '  document_type, document_date (ISO-8601 or null), suggested_case_number (or null),',
      '  suggested_client_name (or null), confidence (0.0–1.0).',
      'Do NOT invent case numbers or IDs. Only extract what is explicitly stated in the text.',
      '',
      `Filename: ${req.filename}`,
      `Language: ${req.language}`,
      '',
      '%%BEGIN_DOCUMENT_TEXT%%',
      req.ocrText.slice(0, 2000)
        .replace(/%%BEGIN_DOCUMENT_TEXT%%/g, '[BEGIN_STRIPPED]')
        .replace(/%%END_DOCUMENT_TEXT%%/g,   '[END_STRIPPED]'),
      '%%END_DOCUMENT_TEXT%%',
    ].join('\n');
  }

  private parseResponse(
    req: EnrichmentRequest,
    promptHash: string,
    raw: string,
  ): EnrichmentResponse {
    let parsed: Record<string, unknown> = {};
    let confidence = 0.3;
    const fieldsEnriched: string[] = [];

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
    } catch {
      logger.warn(`AI response JSON parse failed for doc=${req.documentId}`, {
        category: 'ai',
        agentSource: 'AIStrategist',
      });
    }

    if (typeof parsed['document_type'] === 'string' && parsed['document_type']) {
      fieldsEnriched.push('document_type');
    }
    if (typeof parsed['document_date'] === 'string' && parsed['document_date']) {
      fieldsEnriched.push('document_date');
    }
    if (typeof parsed['confidence'] === 'number') {
      confidence = clamp(parsed['confidence'] as number, CONFIDENCE_FLOOR, CONFIDENCE_CEILING);
    }

    return {
      documentId:           req.documentId,
      modelName:            this.modelName,
      promptHash,
      documentType:         (parsed['document_type'] as EnrichmentResponse['documentType']) ?? null,
      documentDate:         (parsed['document_date'] as string | null) ?? null,
      suggestedCaseNumber:  (parsed['suggested_case_number'] as string | null) ?? null,
      suggestedClientName:  (parsed['suggested_client_name'] as string | null) ?? null,
      confidence:           roundConfidence(confidence),
      fieldsEnriched,
      rawResponse:          raw,
    };
  }
}
