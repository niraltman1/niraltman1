const OLLAMA_BASE = 'http://localhost:11434/api';
const LEGAL_MODEL = process.env['OLLAMA_MODEL'] ?? 'legal-brain';

interface OllamaRequest  { model: string; prompt: string; options?: { temperature?: number } }
interface OllamaResponse { response: string; done: boolean }

export async function generateLegalReasoning(
  prompt: string,
  temperature = 0.3,
  model = LEGAL_MODEL,
): Promise<string> {
  const body: OllamaRequest = { model, prompt, options: { temperature } };

  const res = await fetch(`${OLLAMA_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as OllamaResponse;
  if (!data.response) throw new Error('Invalid response from Ollama API');
  return data.response;
}
