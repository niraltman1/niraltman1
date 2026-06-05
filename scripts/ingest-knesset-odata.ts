#!/usr/bin/env tsx
/**
 * Factum-IL legislation ingestion — HYBRID build-tool (run periodically, by the developer).
 *
 *   1. Knesset OData (KNS_IsraelLaw, LawValidityDesc eq 'תקף') → authoritative list of the
 *      currently-valid Israeli laws + metadata.
 *   2. WikiSource ("ספר החוקים הפתוח") → the consolidated verbatim full text, matched to each
 *      law DETERMINISTICALLY by the embedded Knesset id ({{ח:מאגר|IsraelLawID}}).
 *   3. → a static JSONL(.gz) artifact (one law per line, with optional per-section embeddings).
 *
 * The shipped app NEVER runs this — it reads the bundled artifact via the first-run loader
 * (packages/api/src/utils/legal-corpus-loader.ts). This is the ONLY place legislation is
 * fetched over the network; the real work lives in @factum-il/legal-corpus-ingest, which no
 * runtime/shipped package depends on.
 *
 * Usage:
 *   pnpm ingest-knesset-odata -- [--out <path>] [--embed] [--limit N] [--only <id,id>] [--delay ms] [--batch-size N]
 *
 *   --out          Output artifact path (default assets/legal-corpus/legal-corpus.knesset.jsonl.gz).
 *                  When --batch-size > 0, this is a directory (default assets/legal-corpus/batches/).
 *                  A `.gz` suffix gzip-compresses the stream; otherwise plain JSONL.
 *   --embed        Generate per-section embeddings via @factum-il/retrieval (requires Ollama).
 *   --limit        Process at most N laws (smoke testing).
 *   --only         Comma-separated IsraelLawIDs to ingest (smoke testing).
 *   --delay        Politeness delay (ms) between WikiSource requests (default 300).
 *   --batch-size N Process N laws per file and write to a batches/ directory.
 *                  Set to 0 to disable batching (single-file mode, legacy). Default: 100.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestion, type RunOptions } from '@factum-il/legal-corpus-ingest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'legal-corpus');
const DEFAULT_SINGLE_OUT = join(ASSETS_DIR, 'legal-corpus.knesset.jsonl.gz');
const DEFAULT_BATCH_OUT   = join(ASSETS_DIR, 'batches');
const DEFAULT_BATCH_SIZE  = 100;

function parseArgs(): RunOptions {
  const a = process.argv.slice(2);
  let batchSize: number | undefined;
  let explicitOut: string | undefined;

  const opts: RunOptions = { out: '', embed: false, limit: null, only: null, delayMs: 300 };

  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--out' && a[i + 1]) { explicitOut = a[++i]!; }
    else if (k === '--embed') opts.embed = true;
    else if (k === '--no-embed') opts.embed = false;
    else if (k === '--limit' && a[i + 1]) opts.limit = Number(a[++i]);
    else if (k === '--only' && a[i + 1]) {
      opts.only = new Set(a[++i]!.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)));
    } else if (k === '--delay' && a[i + 1]) opts.delayMs = Number(a[++i]);
    else if (k === '--base' && a[i + 1]) opts.base = a[++i]!;
    else if (k === '--batch-size' && a[i + 1]) batchSize = Number(a[++i]);
  }

  // Resolve batch size: CLI > default (100). Set to 0 for legacy single-file mode.
  opts.batchSize = batchSize ?? DEFAULT_BATCH_SIZE;

  // Resolve output path: explicit --out > mode-specific default.
  opts.out = explicitOut ?? (opts.batchSize > 0 ? DEFAULT_BATCH_OUT : DEFAULT_SINGLE_OUT);

  return opts;
}

runIngestion(parseArgs()).catch((err) => {
  const msg = String(err);
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    process.stderr.write(`::error title=Ingestion fatal::${msg}\n`);
  }
  process.stderr.write(`[knesset] fatal: ${msg}\n`);
  process.exit(1);
});
