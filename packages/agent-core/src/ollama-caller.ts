import type { OllamaConfig } from './types.js';

interface OllamaResponse {
  response: string;
  done:     boolean;
}

export async function callOllama(
  prompt:  string,
  config:  OllamaConfig,
  system?: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${config.baseUrl}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  config.model,
        prompt,
        system,
        stream: false,
        options: { temperature: 0.2, repeat_penalty: 1.05, num_predict: 800 },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!res.ok) return null;

    const data = await res.json() as OllamaResponse;
    return data.response?.trim() ?? null;
  } catch {
    return null;
  }
}

// Health check — call before runAgent if you want to know in advance
export async function isOllamaAvailable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
