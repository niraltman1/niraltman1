#!/usr/bin/env tsx
/**
 * Post-process an existing legal corpus JSONL.gz artifact produced by ingest-knesset-odata,
 * adding per-section nomic-embed-text embeddings to every record that has none.
 *
 * Idempotent: records with `embeddings.length > 0` are passed through unchanged.
 * Atomic: writes to `<out>.tmp`, renames to `<out>` only on clean completion.
 * Streaming: never loads the full corpus into memory — one record at a time.
 *
 * Usage:
 *   pnpm enrich-embeddings -- [--in <path>] [--out <path>] [--delay <ms>] [--dry-run]
 *
 *   --in       Input JSONL.gz  (default: assets/legal-corpus/legal-corpus.knesset.jsonl.gz)
 *   --out      Output JSONL.gz (default: same as --in, overwrite in-place via .tmp)
 *   --delay    ms to sleep between Ollama calls  (default: 0)
 *   --dry-run  Parse + count without writing or calling Ollama
 */

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { writeFile, readFile, rename } from 'node:fs/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(__dirname, '..', 'assets', 'legal-corpus', 'legal-corpus.knesset.jsonl.gz');
const EMBED_MAX_CHARS = 6_000;
const OLLAMA_HEALTH_URL = 'http://127.0.0.1:11434/api/tags';

interface EnrichOptions {
  inPath:  string;
  outPath: string;
  delayMs: number;
  dryRun:  boolean;
}

function parseArgs(): EnrichOptions {
  const a = process.argv.slice(2);
  const opts: EnrichOptions = { inPath: DEFAULT_PATH, outPath: DEFAULT_PATH, delayMs: 0, dryRun: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--in' && a[i + 1])      { opts.inPath = a[++i]!; opts.outPath = opts.inPath; }
    else if (k === '--out' && a[i + 1]) opts.outPath = a[++i]!;
    else if (k === '--delay' && a[i + 1]) opts.delayMs = Number(a[++i]);
    else if (k === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

async function waitForOllama(maxWaitMs = 120_000): Promise<void> {
  const startMs = Date.now();
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(OLLAMA_HEALTH_URL, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    if (Date.now() - startMs > maxWaitMs) {
      throw new Error(`Ollama not ready after ${maxWaitMs / 1000}s — is 'ollama serve' running?`);
    }
    if (i % 10 === 0) process.stdout.write(`[enrich] still waiting for Ollama (${Math.round((Date.now() - startMs) / 1000)}s)...\n`);
    await new Promise(r => setTimeout(r, 1_000));
  }
}

async function loadEmbed(): Promise<(text: string) => Promise<number[] | null>> {
  const mod = await import('@factum-il/retrieval');
  return mod.embed as (text: string) => Promise<number[] | null>;
}

async function enrichCorpus(opts: EnrichOptions): Promise<void> {
  const startMs = Date.now();

  if (!existsSync(opts.inPath)) {
    throw new Error(`Input corpus not found: ${opts.inPath}\nRun 'pnpm ingest-knesset-odata' first.`);
  }

  let embed: ((text: string) => Promise<number[] | null>) | null = null;
  if (!opts.dryRun) {
    process.stdout.write('[enrich] checking Ollama...\n');
    await waitForOllama();
    process.stdout.write('[enrich] Ollama ready.\n');
    embed = await loadEmbed();
  }

  const tmpPath = `${opts.outPath}.tmp`;

  // Output stream (null in dry-run)
  let gzOut: ReturnType<typeof createGzip> | null = null;
  let fileOut: ReturnType<typeof createWriteStream> | null = null;
  let closeOutputPromise: Promise<void> | null = null;

  if (!opts.dryRun) {
    fileOut = createWriteStream(tmpPath);
    gzOut   = createGzip();
    gzOut.pipe(fileOut);
    closeOutputPromise = new Promise<void>((resolve, reject) => {
      fileOut!.on('finish', resolve);
      fileOut!.on('error', reject);
      gzOut!.on('error', reject);
    });
  }

  // Input stream
  const gunzip = createGunzip();
  const inStream = createReadStream(opts.inPath);
  inStream.pipe(gunzip);

  const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

  let total = 0, enriched = 0, skippedAlready = 0, sectionsEmbedded = 0, nullReturns = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = JSON.parse(line);
    total++;

    const alreadyHasEmbeddings = Array.isArray(rec.embeddings) && rec.embeddings.length > 0;
    const canEmbed = !opts.dryRun && !alreadyHasEmbeddings && rec.status === 'ingested' && embed;

    if (canEmbed) {
      const embs: { orderIndex: number; model: string; vector: number[] }[] = [];
      for (const s of rec.sections ?? []) {
        const vec = await embed!((s.verbatimText ?? '').slice(0, EMBED_MAX_CHARS));
        if (vec) {
          embs.push({ orderIndex: s.orderIndex, model: 'nomic-embed-text', vector: vec });
          sectionsEmbedded++;
        } else {
          nullReturns++;
        }
        if (opts.delayMs > 0) await new Promise(r => setTimeout(r, opts.delayMs));
      }
      rec.embeddings = embs;
      enriched++;
    } else if (alreadyHasEmbeddings) {
      skippedAlready++;
    }

    if (!opts.dryRun) gzOut!.write(`${JSON.stringify(rec)}\n`);

    if (total % 100 === 0) {
      process.stdout.write(
        `[enrich] ${total} laws processed` +
        ` (${enriched} enriched, ${skippedAlready} already had embeddings)` +
        ` — ${Math.round((Date.now() - startMs) / 1000)}s elapsed\n`,
      );
    }
  }

  if (!opts.dryRun && gzOut && closeOutputPromise) {
    gzOut.end();
    await closeOutputPromise;
    await rename(tmpPath, opts.outPath);
  }

  const elapsedMs = Date.now() - startMs;

  process.stdout.write(
    `\n[enrich] done: ${total} laws processed${opts.dryRun ? ' (dry-run, no changes)' : ''}\n` +
    `  enriched:        ${enriched}\n` +
    `  already present: ${skippedAlready}\n` +
    `  sections embedded: ${sectionsEmbedded}\n` +
    `  null returns:    ${nullReturns}\n` +
    `  elapsed:         ${Math.round(elapsedMs / 1000)}s\n`,
  );

  if (process.env['GITHUB_ACTIONS'] === 'true') {
    process.stdout.write(
      `::notice title=Embedding complete::total=${total} enriched=${enriched} ` +
      `already_had=${skippedAlready} sections_embedded=${sectionsEmbedded} ` +
      `null_returns=${nullReturns} elapsed=${Math.round(elapsedMs / 1000)}s\n`,
    );
  }

  // Update corpus manifest when embeddings were added.
  if (!opts.dryRun && enriched > 0) {
    const manifestPath = join(dirname(opts.outPath), 'corpus-manifest.json');
    try {
      const existing = JSON.parse(await readFile(manifestPath, 'utf-8'));
      existing.hasEmbeddings = true;
      existing.embeddingModel = 'nomic-embed-text';
      existing.embeddedSectionCount = (existing.embeddedSectionCount ?? 0) + sectionsEmbedded;
      existing.embeddingGeneratedAt = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
    } catch { /* manifest absent — not fatal */ }
  }
}

enrichCorpus(parseArgs()).catch((err) => {
  const msg = String(err);
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    process.stderr.write(`::error title=Embedding fatal::${msg}\n`);
  }
  process.stderr.write(`[enrich] fatal: ${msg}\n`);
  process.exit(1);
});
