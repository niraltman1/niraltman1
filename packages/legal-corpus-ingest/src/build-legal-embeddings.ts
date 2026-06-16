/**
 * build-legal-embeddings.ts — Phase 14/15
 *
 * Generates embeddings for all public LegalDocuments that lack them.
 * Uses Ollama nomic-embed-text model (same as rest of platform).
 * Incremental: skips already-embedded documents.
 * Refreshes stale vectors when --refresh flag is passed.
 *
 * Usage:
 *   pnpm tsx packages/legal-corpus-ingest/src/build-legal-embeddings.ts [--limit 1000] [--refresh]
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DatabaseConnection,
  MigrationRunner,
  LegalDocumentRepository,
  LegalDocumentEmbeddingRepository,
} from '@factum-il/database';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH   = process.env['FACTUM_IL_DB_PATH']
  ?? join(__dirname, '..', '..', '..', '_data', 'factum-il.db');
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');
const OLLAMA_URL     = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
const EMBED_MODEL    = 'nomic-embed-text';
const BATCH_SIZE     = 10;
const LIMIT          = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '500', 10);
const REFRESH        = process.argv.includes('--refresh');

async function embedText(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 2000) }),
      signal:  AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const db = new DatabaseConnection({ path: DB_PATH });
  const runner = new MigrationRunner(db, MIGRATIONS_DIR);
  runner.run();

  const legalDocuments = new LegalDocumentRepository(db);
  const embeddings     = new LegalDocumentEmbeddingRepository(db);

  // Health check Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`[build-legal-embeddings] Ollama not reachable at ${OLLAMA_URL}: ${String(err)}`);
    console.error('Embeddings require Ollama with nomic-embed-text model. Exiting.');
    process.exit(1);
  }

  const startTime = Date.now();
  let generated = 0;
  let failed    = 0;
  let skipped   = 0;

  const candidates = legalDocuments.documentsMissingEmbedding(LIMIT);
  console.log(`[build-legal-embeddings] ${candidates.length} documents need embeddings (limit=${LIMIT}, refresh=${REFRESH})`);

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    for (const { documentId, text } of batch) {
      if (!REFRESH) {
        const existing = embeddings.getByDocumentId(documentId);
        if (existing) { skipped++; continue; }
      }

      const embedding = await embedText(text);
      if (!embedding) {
        failed++;
        console.warn(`[build-legal-embeddings] embedding failed for ${documentId}`);
        continue;
      }

      embeddings.upsert({ documentId, embedding, model: EMBED_MODEL });
      legalDocuments.markIndexed(documentId);
      generated++;
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[build-legal-embeddings] progress: ${i + batch.length}/${candidates.length} | generated=${generated} failed=${failed} skipped=${skipped} elapsed=${elapsed}s`);
  }

  const totalMs = Date.now() - startTime;
  console.log(`[build-legal-embeddings] done — generated=${generated} failed=${failed} skipped=${skipped} elapsed=${Math.round(totalMs / 1000)}s`);

  // Benchmarking output
  const stats = legalDocuments.stats();
  const report = {
    total_documents:     stats.total,
    with_embeddings:     stats.withEmbeddings,
    generated_this_run:  generated,
    failed_this_run:     failed,
    elapsed_ms:          totalMs,
    embed_model:         EMBED_MODEL,
    timestamp:           new Date().toISOString(),
  };

  process.stdout.write('\n[build-legal-embeddings] benchmark:\n' + JSON.stringify(report, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
