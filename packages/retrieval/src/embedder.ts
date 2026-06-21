const OLLAMA_BASE = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = 'nomic-embed-text';

/** Dimensionality of the production embedding model (nomic-embed-text → 768). */
export const EMBED_DIM = 768;

/**
 * Deterministic, offline stand-in for `embed()` used when no Ollama server is
 * available — e.g. building the corpus DB end-to-end in CI. It is NOT semantic:
 * it maps text → a stable pseudo-random unit vector of length EMBED_DIM so the
 * full chunk → embedding → vec_legal_chunks pipeline can be exercised and the
 * vector tables populated. Swap back to `embed()` (nomic-embed-text) for real
 * retrieval quality.
 *
 * Properties relied upon downstream:
 *  - deterministic: identical text always yields the identical vector;
 *  - fixed length EMBED_DIM, matching vec0(float[768]);
 *  - unit-normalized, so cosineSimilarity is well-behaved.
 */
export function mockEmbed(text: string, dim = EMBED_DIM): number[] {
  // FNV-1a (32-bit) over the text → seed for a small xorshift PRNG.
  let seed = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193) >>> 0;
  }
  if (seed === 0) seed = 0x9e3779b9; // xorshift must not be seeded with 0

  let state = seed >>> 0;
  const next = (): number => {
    // xorshift32 → float in [-1, 1)
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;  state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };

  const vec = new Array<number>(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const v = next();
    vec[i] = v;
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] = vec[i]! / norm;
  return vec;
}

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
