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
 *   pnpm ingest-knesset-odata -- [--out <path>] [--embed] [--limit N] [--only <id,id>] [--delay ms]
 *
 *   --out     Output artifact path (default assets/legal-corpus/legal-corpus.knesset.jsonl.gz).
 *             A `.gz` suffix gzip-compresses the stream; otherwise plain JSONL.
 *   --embed   Generate per-section embeddings via @factum-il/retrieval (requires Ollama).
 *   --limit   Process at most N laws (smoke testing).
 *   --only    Comma-separated IsraelLawIDs to ingest (smoke testing).
 *   --delay   Politeness delay (ms) between WikiSource requests (default 300).
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestion, type RunOptions } from '@factum-il/legal-corpus-ingest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(__dirname, '..', 'assets', 'legal-corpus', 'legal-corpus.knesset.jsonl.gz');

function parseArgs(): RunOptions {
  const a = process.argv.slice(2);
  const opts: RunOptions = { out: DEFAULT_OUT, embed: false, limit: null, only: null, delayMs: 300 };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--out' && a[i + 1]) opts.out = a[++i]!;
    else if (k === '--embed') opts.embed = true;
    else if (k === '--no-embed') opts.embed = false;
    else if (k === '--limit' && a[i + 1]) opts.limit = Number(a[++i]);
    else if (k === '--only' && a[i + 1]) {
      opts.only = new Set(a[++i]!.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)));
    } else if (k === '--delay' && a[i + 1]) opts.delayMs = Number(a[++i]);
    else if (k === '--base' && a[i + 1]) opts.base = a[++i]!;
  }
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
