#!/usr/bin/env tsx
/**
 * Ingest the verbatim Israeli verdict corpus (case law / פסיקה) into the dedicated
 * VerdictCorpus knowledge base (migration 063), from the public open dataset
 * LevMuchnik/SupremeCourtOfIsrael (2022 snapshot of Supreme Court public rulings).
 *
 * Usage:
 *   tsx scripts/ingest-verdict-corpus.ts [--db <path>] [--from-dir <dir>]
 *                                        [--max <n>] [--page <n>] [--embed]
 *
 *   --from-dir <dir>  Read rows from "<dir>/*.jsonl" instead of fetching. Use this when
 *                     network egress to Hugging Face is restricted: export the dataset
 *                     to JSONL once (where allowed) and ingest offline.
 *   --max <n>         Stop after ingesting ~n rows (default: all / 5000 when fetching).
 *   --page <n>        Rows per datasets-server request when fetching (max 100).
 *   --embed           Generate per-verdict embeddings (requires Ollama running locally).
 *
 * VERBATIM ONLY: this script never authors legal text — it copies the dataset's ruling
 * text and lifts its metadata. Re-ingestion is idempotent (keyed by document hash).
 *
 * NOTE: Fetching needs `datasets-server.huggingface.co` in the environment network
 * allowlist. Until then, use --from-dir, or the script will report the blocked host.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, MigrationRunner, VerdictCorpusRepository } from '@factum-il/database';
import {
  ingestRows,
  readJsonlDir,
  fetchVerdictRowsPage,
  SUPREME_COURT_PROVENANCE,
} from '../packages/api/src/modules/verdict-corpus/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args { dbPath: string; fromDir?: string; max: number; page: number; embed: boolean; }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { dbPath: join(__dirname, '..', '_data', 'factum-il.db'), max: 5000, page: 100, embed: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db' && a[i + 1]) out.dbPath = a[++i]!;
    else if (a[i] === '--from-dir' && a[i + 1]) out.fromDir = a[++i]!;
    else if (a[i] === '--max' && a[i + 1]) out.max = Number(a[++i]);
    else if (a[i] === '--page' && a[i + 1]) out.page = Math.min(Number(a[++i]), 100);
    else if (a[i] === '--embed') out.embed = true;
  }
  return out;
}

const EMBED_URL   = (process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
const EMBED_MODEL = process.env['OLLAMA_EMBED_MODEL'] ?? 'nomic-embed-text';

/** Health-checked Ollama embedder. Returns null (never throws) if Ollama is unavailable. */
async function makeEmbedder(): Promise<(text: string) => Promise<number[] | null>> {
  let healthy = false;
  try {
    const res = await fetch(`${EMBED_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    healthy = res.ok;
  } catch { healthy = false; }
  if (!healthy) {
    console.warn(`⚠️  Ollama not reachable at ${EMBED_URL} — continuing WITHOUT embeddings.`);
    return async () => null;
  }
  return async (text: string): Promise<number[] | null> => {
    try {
      const res = await fetch(`${EMBED_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      });
      if (!res.ok) return null;
      const body = await res.json() as { embedding?: number[] };
      return Array.isArray(body.embedding) ? body.embedding : null;
    } catch { return null; }
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const db = new DatabaseConnection({ path: args.dbPath });
  new MigrationRunner(db, join(__dirname, '..', 'migrations')).run();
  const repo = new VerdictCorpusRepository(db);

  const embed = args.embed ? await makeEmbedder() : undefined;

  console.log(`Ingesting verdict corpus → ${args.dbPath}`);
  console.log(`Source: ${SUPREME_COURT_PROVENANCE.sourceDataset} (snapshot ${SUPREME_COURT_PROVENANCE.snapshotLabel})`);

  let ingested = 0;
  let skipped  = 0;

  if (args.fromDir) {
    console.log(`Reading rows from ${args.fromDir}/*.jsonl …`);
    const res = await ingestRows(repo, readJsonlDir(args.fromDir), SUPREME_COURT_PROVENANCE, embed);
    ingested += res.ingested; skipped += res.skipped;
  } else {
    console.log(`Fetching from Hugging Face datasets-server (page=${args.page}, max=${args.max}) …`);
    for (let offset = 0; offset < args.max; offset += args.page) {
      const length = Math.min(args.page, args.max - offset);
      const rows = await fetchVerdictRowsPage({ offset, length });
      if (rows.length === 0) break;
      const res = await ingestRows(repo, rows, SUPREME_COURT_PROVENANCE, embed);
      ingested += res.ingested; skipped += res.skipped;
      process.stdout.write(`\r  ingested ${ingested}, skipped ${skipped}`);
    }
    process.stdout.write('\n');
  }

  const stats = repo.stats();
  console.log(`✅ Done. Ingested ${ingested}, skipped ${skipped}.`);
  console.log(`   Corpus now holds ${stats.verdicts} rulings across ${stats.courts} courts (${stats.embedded} embedded).`);
  db.close();
}

main().catch((err) => {
  console.error('❌ Ingestion failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
