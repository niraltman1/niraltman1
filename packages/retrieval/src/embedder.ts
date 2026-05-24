const OLLAMA_BASE = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = 'nomic-embed-text';

export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
