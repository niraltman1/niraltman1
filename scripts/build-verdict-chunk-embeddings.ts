#!/usr/bin/env tsx
/**
 * Build CHUNK-LEVEL embeddings for case law (audit finding A.4 #3).
 *
 * Sibling of build-verdict-embeddings.ts, which embeds each verdict as ONE
 * document-level vector truncated to its first ~2,000 chars. This script instead
 * splits each public LegalDocuments.text into structural chunks (verdict profile,
 * @factum-il/retrieval chunkDocument) and embeds every chunk, so a relevant
 * passage deep inside a long ruling is independently retrievable.
 *
 * For each document it:
 *   1. chunks LegalDocuments.text with the 'verdict' profile,
 *   2. inserts chunks into LegalDocumentChunks (idempotent on document_id+index),
 *   3. embeds each chunk via Ollama and stores the vector in
 *      LegalDocumentChunks.embedding + vec_legal_chunks (migration 088).
 *
 * Usage:
 *   tsx scripts/build-verdict-chunk-embeddings.ts [--db <path>] [--limit <n>] [--dry-run]
 *
 *   --db <path>   Path to factum-il.db (default: _data/factum-il.db)
 *   --limit <n>   Max documents to process this run (default: all pending)
 *   --dry-run     Report how many documents/chunks are pending and exit
 *
 * Requires Ollama running locally with nomic-embed-text available.
 * Set OLLAMA_BASE_URL to override (default: http://127.0.0.1:11434).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DatabaseConnection,
  MigrationRunner,
  LegalDocumentChunkEmbeddingRepository,
} from '@factum-il/database';
import { chunkDocument } from '@factum-il/retrieval';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args { dbPath: string; limit: number; dryRun: boolean; }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const args: Args = {
    dbPath: join(__dirname, '..', '_data', 'factum-il.db'),
    limit:  Number.POSITIVE_INFINITY,
    dryRun: false,
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db'    && a[i + 1]) args.dbPath = a[++i]!;
    if (a[i] === '--limit' && a[i + 1]) args.limit  = Number(a[++i]);
    if (a[i] === '--dry-run')           args.dryRun  = true;
  }
  return args;
}

const EMBED_URL   = (process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMBED_MODEL = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';
const EMBED_CHARS = 2_000; // per-chunk truncation guard (chunks are already ≤ ~2,800)

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

interface PendingDoc { id: number; document_id: string; text: string }

async function main(): Promise<void> {
  const args = parseArgs();
  const db   = new DatabaseConnection({ path: args.dbPath });
  new MigrationRunner(db, join(__dirname, '..', 'migrations')).run();
  const chunkRepo = new LegalDocumentChunkEmbeddingRepository(db);

  // Documents with no chunk rows yet (or whose chunks are unembedded).
  const pendingDocs = db.prepare(`
    SELECT ld.id, ld.document_id, ld.text
    FROM LegalDocuments ld
    WHERE ld.is_active = 1 AND ld.visibility_scope = 'PUBLIC'
      AND ld.text IS NOT NULL AND length(ld.text) > 20
      AND NOT EXISTS (
        SELECT 1 FROM LegalDocumentChunks lc
        WHERE lc.document_id = ld.document_id AND lc.embedding IS NOT NULL
      )
  `).all() as PendingDoc[];

  console.log(`Pending documents (no chunk embeddings): ${pendingDocs.length}`);
  console.log(`vec_legal_chunks available: ${chunkRepo.isVecAvailable()}`);
  console.log(`Existing chunk embeddings: ${chunkRepo.count()}`);

  if (args.dryRun || pendingDocs.length === 0) {
    if (pendingDocs.length === 0) console.log('✅ All documents have chunk embeddings.');
    db.close();
    return;
  }

  // Health-check Ollama before doing any work.
  try {
    const res = await fetch(`${EMBED_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`❌ Ollama not reachable at ${EMBED_URL}: ${String(e)}`);
    db.close();
    process.exit(1);
  }

  const insertChunk = db.prepare(`
    INSERT INTO LegalDocumentChunks (document_id, chunk_index, chunk_text, char_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(document_id, chunk_index) DO NOTHING
  `);
  const getChunkId = db.prepare(
    'SELECT id FROM LegalDocumentChunks WHERE document_id = ? AND chunk_index = ?',
  );

  let docsDone = 0;
  let chunksEmbedded = 0;
  let failed = 0;
  const startMs = Date.now();

  const slice = Number.isFinite(args.limit) ? pendingDocs.slice(0, args.limit) : pendingDocs;
  for (const doc of slice) {
    const chunks = chunkDocument(doc.text, doc.id, 'verdict');
    if (chunks.length === 0) { docsDone += 1; continue; }

    // Persist chunk rows first (synchronous, transactional).
    db.transaction(() => {
      for (const c of chunks) {
        insertChunk.run(doc.document_id, c.chunkIndex, c.text, c.text.length);
      }
    });

    // Embed each chunk (async Ollama calls outside the transaction).
    for (const c of chunks) {
      const row = getChunkId.get(doc.document_id, c.chunkIndex) as { id: number } | undefined;
      if (!row) continue;
      const vec = await embed(c.text);
      if (vec) {
        chunkRepo.upsert({ chunkId: row.id, embedding: vec });
        chunksEmbedded += 1;
      } else {
        failed += 1;
      }
    }

    docsDone += 1;
    const elapsed = Math.round((Date.now() - startMs) / 1000);
    process.stdout.write(`\r  docs ${docsDone}/${slice.length} — chunks embedded ${chunksEmbedded} (${failed} failed) — ${elapsed}s`);
  }

  process.stdout.write('\n');
  console.log(`✅ Done: ${docsDone} docs, ${chunksEmbedded} chunk embeddings, ${failed} failed — ${Math.round((Date.now() - startMs) / 1000)}s`);
  db.close();
}

main().catch((err) => {
  console.error('❌ Chunk embedding build failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
