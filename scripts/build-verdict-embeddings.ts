#!/usr/bin/env tsx
/**
 * Generate / backfill embeddings for all public LegalDocuments that have no
 * vector yet. Stores results in LegalDocumentEmbeddings + vec_legal_documents.
 *
 * Usage:
 *   tsx scripts/build-verdict-embeddings.ts [--db <path>] [--batch <n>] [--dry-run]
 *
 *   --db <path>    Path to factum-il.db (default: _data/factum-il.db)
 *   --batch <n>    Documents per Ollama batch (default: 50)
 *   --dry-run      Count missing embeddings and exit without generating
 *
 * Requires Ollama running locally with nomic-embed-text available.
 * Set OLLAMA_BASE_URL to override (default: http://127.0.0.1:11434).
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

interface Args { dbPath: string; batch: number; dryRun: boolean; }

function parseArgs(): Args {
  const a    = process.argv.slice(2);
  const args: Args = {
    dbPath:  join(__dirname, '..', '_data', 'factum-il.db'),
    batch:   50,
    dryRun:  false,
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db'    && a[i + 1]) args.dbPath = a[++i]!;
    if (a[i] === '--batch' && a[i + 1]) args.batch  = Number(a[++i]);
    if (a[i] === '--dry-run')           args.dryRun  = true;
  }
  return args;
}

const EMBED_URL   = (process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMBED_MODEL = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';
const EMBED_CHARS = 2_000; // truncate to head of document where the holding and parties appear

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBED_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, EMBED_CHARS) }),
    });
    if (!res.ok) return null;
    const body = await res.json() as { embedding?: number[] };
    return Array.isArray(body.embedding) ? body.embedding : null;
  } catch { return null; }
}

async function main(): Promise<void> {
  const args     = parseArgs();
  const db       = new DatabaseConnection({ path: args.dbPath });
  new MigrationRunner(db, join(__dirname, '..', 'migrations')).run();
  const repo     = new LegalDocumentRepository(db);
  const embedRepo = new LegalDocumentEmbeddingRepository(db);

  const stats  = repo.stats();
  const total  = stats.total;
  const embedded = stats.withEmbeddings;
  console.log(`LegalDocuments: ${total} total, ${embedded} embedded`);
  const pending = total - embedded;
  console.log(`Pending embeddings: ${pending}`);

  if (args.dryRun || pending === 0) {
    if (pending === 0) console.log('✅ All documents embedded.');
    db.close();
    return;
  }

  // Health-check Ollama
  try {
    const res = await fetch(`${EMBED_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`❌ Ollama not reachable at ${EMBED_URL}: ${String(e)}`);
    db.close();
    process.exit(1);
  }

  let generated = 0;
  let failed    = 0;
  const startMs = Date.now();

  // Query documents that have no embedding yet
  const missingQuery = db.prepare(`
    SELECT ld.id, ld.document_id, ld.text
    FROM LegalDocuments ld
    LEFT JOIN LegalDocumentEmbeddings lde ON lde.document_id = ld.document_id
    WHERE ld.is_active = 1 AND ld.visibility_scope = 'PUBLIC' AND lde.id IS NULL
    LIMIT ?
  `);

  while (true) {
    const docs = missingQuery.all(args.batch) as Array<{ id: number; document_id: string; text: string }>;
    if (docs.length === 0) break;

    for (const doc of docs) {
      const vec = await embed(doc.text);
      if (vec) {
        embedRepo.upsert({ documentId: doc.document_id, embedding: vec, model: EMBED_MODEL });
        generated += 1;
      } else {
        failed += 1;
      }
    }

    const elapsed = Math.round((Date.now() - startMs) / 1000);
    process.stdout.write(`\r  embedded ${generated} (${failed} failed) — ${elapsed}s`);
  }

  process.stdout.write('\n');
  console.log(`✅ Done: ${generated} embedded, ${failed} failed — ${Math.round((Date.now() - startMs) / 1000)}s`);
  db.close();
}

main().catch((err) => {
  console.error('❌ Embedding build failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
