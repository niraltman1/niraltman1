#!/usr/bin/env tsx
/**
 * Ingest the core Israeli legal corpus (28 sources) into the verbatim, per-law-isolated
 * knowledge base (LegalSources / LegalSections / LegalSectionEmbeddings — migration 061).
 *
 * Usage:
 *   tsx scripts/ingest-legal-corpus.ts [--db <path>] [--from-dir <dir>] [--embed] [--only k1,k2]
 *
 *   --from-dir <dir>  Read each source from "<dir>/<sourceKey>.html" instead of fetching.
 *                     Use this when network egress is restricted: drop the official
 *                     (open-source) HTML pages in a folder and ingest offline.
 *   --embed           Generate per-section embeddings (requires Ollama running locally).
 *   --only            Comma-separated source keys to limit the run.
 *
 * VERBATIM ONLY: this script never authors legal text. It slices fetched/local HTML.
 * Each source is isolated — its sections are replaced atomically and never merged with
 * another law's. A source that cannot be fetched is reported and skipped, not faked.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, MigrationRunner, LegalCorpusRepository } from '@factum-il/database';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args { dbPath: string; fromDir?: string; embed: boolean; only?: string[]; }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { dbPath: join(__dirname, '..', '_data', 'factum-il.db'), embed: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--db' && a[i + 1]) out.dbPath = a[++i]!;
    else if (a[i] === '--from-dir' && a[i + 1]) out.fromDir = a[++i]!;
    else if (a[i] === '--embed') out.embed = true;
    else if (a[i] === '--only' && a[i + 1]) out.only = a[++i]!.split(',').map((s) => s.trim());
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const db = new DatabaseConnection({ path: args.dbPath });
  new MigrationRunner(db, join(__dirname, '..', 'migrations')).run();
  const repo = new LegalCorpusRepository(db);

  // Lazy imports so the script loads even if these are unavailable.
  const { ingestAll } = await import('../packages/api/src/modules/legal-corpus/ingest.js');

  let embed: ((t: string) => Promise<number[] | null>) | undefined;
  if (args.embed) {
    try {
      ({ embed } = await import('@factum-il/retrieval'));
    } catch {
      process.stderr.write('[legal-corpus] --embed requested but @factum-il/retrieval unavailable; skipping embeddings.\n');
    }
  }

  process.stdout.write(`[legal-corpus] ingesting${args.fromDir ? ` from ${args.fromDir}` : ' (network)'}${args.embed ? ' +embeddings' : ''}…\n`);
  const results = await ingestAll(repo, {
    ...(args.fromDir ? { localDir: args.fromDir } : {}),
    ...(embed ? { embed } : {}),
    ...(args.only ? { only: args.only } : {}),
  });

  let ok = 0, failed = 0;
  for (const r of results) {
    if (r.ok) { ok++; process.stdout.write(`  ✓ ${r.sourceKey.padEnd(40)} ${r.sections} sections${r.embedded ? `, ${r.embedded} embedded` : ''}\n`); }
    else { failed++; process.stdout.write(`  ✗ ${r.sourceKey.padEnd(40)} ${r.reason ?? 'failed'}\n`); }
  }
  const s = repo.stats();
  process.stdout.write(`\n[legal-corpus] done: ${ok} ok, ${failed} failed. KB now: ${s.sources} sources, ${s.sections} sections, ${s.embedded} embedded.\n`);
  db.close();
  if (failed > 0 && ok === 0) process.exit(1);
}

void main();
