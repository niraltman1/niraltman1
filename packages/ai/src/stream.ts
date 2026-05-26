/**
 * streamGenerate — streaming token generator for the Ollama /api/generate endpoint.
 *
 * Uses NDJSON streaming (stream: true). Each line from Ollama is a JSON object
 * with a `response` field containing the next token(s), and `done: true` on the
 * final line.
 *
 * Caller is responsible for accumulating tokens into a full response string.
 *
 * Circuit breaker integration: if the breaker is open, throws immediately.
 * On network failure: records the failure in the circuit breaker and rethrows.
 */

import { getCircuitBreaker } from '@factum-il/model-router';

const DEFAULT_MODEL      = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
const DEFAULT_OLLAMA_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS = 120_000;  // streaming can take longer than non-streaming

interface OllamaStreamChunk {
  response: string;
  done:     boolean;
}

/**
 * Streams tokens from Ollama using the /api/generate endpoint with stream: true.
 * Yields the `response` string from each NDJSON line as it arrives.
 * Stops when a line with `done: true` is received.
 *
 * @throws if the circuit breaker is open
 * @throws on network error (also records failure in circuit breaker)
 */
export async function* streamGenerate(
  prompt: string,
  opts?: {
    model?:  string;
    system?: string;
    signal?: AbortSignal;
  },
): AsyncGenerator<string, void, unknown> {
  const model   = opts?.model  ?? DEFAULT_MODEL;
  const baseUrl = DEFAULT_OLLAMA_URL;

  const cb = getCircuitBreaker(model);
  if (cb.isOpen()) {
    throw new Error(`Ollama circuit breaker open for model "${model}" — streaming unavailable`);
  }

  const body = JSON.stringify({
    model,
    prompt,
    stream: true,
    ...(opts?.system !== undefined ? { system: opts.system } : {}),
    options: { temperature: 0.1, repeat_penalty: 1.05, num_predict: 512 },
  });

  // Combine caller's signal with our timeout signal
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = opts?.signal
    ? AbortSignal.any([opts.signal, timeoutSignal])
    : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
  } catch (e) {
    cb.recordFailure();
    throw new Error(`Ollama stream connection failed: ${String(e)}`);
  }

  if (!res.ok) {
    cb.recordFailure();
    throw new Error(`Ollama stream API error: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    cb.recordFailure();
    throw new Error('Ollama stream response has no body');
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let   buffer  = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // NDJSON: split on newlines and process complete lines
      const lines = buffer.split('\n');
      // Last element may be an incomplete line — keep it in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let chunk: OllamaStreamChunk;
        try {
          chunk = JSON.parse(trimmed) as OllamaStreamChunk;
        } catch {
          // Malformed line — skip
          continue;
        }

        if (chunk.response) {
          yield chunk.response;
        }

        if (chunk.done) {
          cb.recordSuccess();
          return;
        }
      }
    }

    // Flush any remaining buffer content
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer.trim()) as OllamaStreamChunk;
        if (chunk.response) yield chunk.response;
        if (chunk.done) cb.recordSuccess();
      } catch {
        // Incomplete final chunk — ignore
      }
    }
  } catch (e) {
    cb.recordFailure();
    throw e;
  } finally {
    reader.releaseLock();
  }
}
