import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { iterateValidLaws, ODATA_BASE, type ValidLaw } from './odata-registry.js';
import { resolveLaw, type WikiResolution } from './wiki-resolve.js';
import { structureLaw } from './structure.js';
import { ArtifactWriter, type EmbeddingRec } from './artifact.js';

const EMBED_MAX_CHARS = 6_000; // keep nomic-embed-text inputs within its context window
const WIKI_CONCURRENCY = 4;   // parallel WikiSource resolutions (safe: ~4 req/s, well below Wikimedia limits)

export interface RunOptions {
  out:      string;                 // artifact path (.gz → gzip)
  embed?:   boolean;                // generate per-section embeddings (requires Ollama)
  limit?:   number | null;          // cap laws processed (smoke testing)
  only?:    Set<number> | null;     // restrict to specific IsraelLawIDs (smoke testing)
  delayMs?: number;                 // politeness delay between WikiSource requests
  base?:    string;                 // OData base URL override
}

export interface RunSummary {
  written:      number;
  ingested:     number;
  metadataOnly: number;
  sections:     number;
  embedded:     number;
  matchRate:    number;             // % of processed laws that resolved to full text
  elapsedMs:    number;
}

/** Minimal promise pool — limits concurrent async tasks without external dependencies. */
function createPool(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const attempt = () => {
          active++;
          fn().then(resolve, reject).finally(() => {
            active--;
            queue.shift()?.();
          });
        };
        active < concurrency ? attempt() : queue.push(attempt);
      });
    },
  };
}

async function loadEmbed(): Promise<((t: string) => Promise<number[] | null>) | null> {
  try {
    const mod = await import('@factum-il/retrieval');
    return mod.embed as (t: string) => Promise<number[] | null>;
  } catch {
    process.stderr.write('[knesset] --embed requested but @factum-il/retrieval is unavailable; skipping embeddings.\n');
    return null;
  }
}

/**
 * Hybrid ingestion: Knesset OData registry (validity + metadata) × WikiSource (verbatim full
 * text, matched by the embedded {{ח:מאגר|IsraelLawID}}). Streams one JSONL record per law to
 * `opts.out`. Laws with no ID-verified WikiSource page are written metadata-only (no text is
 * ever fabricated). Never authors legal text — only slices fetched HTML.
 */
export async function runIngestion(opts: RunOptions): Promise<RunSummary> {
  const startMs = Date.now();
  const base = opts.base ?? ODATA_BASE;
  const delayMs = opts.delayMs ?? 300;
  await mkdir(dirname(opts.out), { recursive: true });

  const embed = opts.embed ? await loadEmbed() : null;

  // ── Pass 0: collect all valid law IDs from OData (fast — ~11 pages, ~6 s) ────────────────
  process.stdout.write(`[knesset] fetching OData registry...\n`);
  const allLaws: ValidLaw[] = [];
  for await (const law of iterateValidLaws({ base })) {
    if (opts.only && !opts.only.has(law.israelLawId)) continue;
    allLaws.push(law);
    if (opts.only && allLaws.length >= opts.only.size) break;
    if (opts.limit != null && allLaws.length >= opts.limit) break;
  }
  process.stdout.write(`[knesset] ${allLaws.length} laws to process · out: ${opts.out}${embed ? ' · +embeddings' : ''}\n`);

  const writer = new ArtifactWriter(opts.out);
  let processed = 0, ingested = 0, metadataOnly = 0, sectionTotal = 0, embedded = 0;

  // Structure + (optionally) embed one resolved law, write it, and update counters.
  const processLaw = async (law: ValidLaw, resolved: WikiResolution): Promise<void> => {
    const rec = structureLaw(law, resolved);
    if (rec.status === 'ingested') {
      ingested += 1;
      sectionTotal += rec.sections.length;
      if (embed) {
        const embs: EmbeddingRec[] = [];
        for (const s of rec.sections) {
          const vec = await embed(s.verbatimText.slice(0, EMBED_MAX_CHARS));
          if (vec) { embs.push({ orderIndex: s.orderIndex, model: 'nomic-embed-text', vector: vec }); embedded += 1; }
        }
        rec.embeddings = embs;
      }
      process.stdout.write(`  ✓ ${String(law.israelLawId).padEnd(8)} ${rec.shortName} — ${rec.sections.length} sections\n`);
    } else {
      metadataOnly += 1;
      process.stdout.write(`  · ${String(law.israelLawId).padEnd(8)} ${rec.shortName} — metadata-only\n`);
    }
    writer.write(rec);
  };

  // ── Pass 1: parallel WikiSource resolution (P=4) ────────────────────────────────────────
  const retryQueue: ValidLaw[] = [];
  const pool = createPool(WIKI_CONCURRENCY);
  await Promise.all(allLaws.map((law) => pool.run(async () => {
    const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs });
    processed += 1;
    if (processed % 100 === 0) {
      const pct = Math.round((processed / allLaws.length) * 100);
      process.stdout.write(`[knesset] progress: ${processed}/${allLaws.length} (${pct}%) — elapsed ${Math.round((Date.now() - startMs) / 1000)}s\n`);
    }
    if (!resolved.matched && resolved.transient) { retryQueue.push(law); }
    else { await processLaw(law, resolved); }
  })));

  // ── Pass 2: retry transient failures at 3× delay ────────────────────────────────────────
  if (retryQueue.length > 0) {
    process.stdout.write(`[knesset] retrying ${retryQueue.length} transient failure(s) at ${delayMs * 3}ms...\n`);
    for (const law of retryQueue) {
      const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs: delayMs * 3 });
      await processLaw(law, resolved);
    }
  }

  await writer.close();
  const elapsedMs = Date.now() - startMs;
  const matchRate = processed ? Math.round((ingested / processed) * 1000) / 10 : 0;

  process.stdout.write(
    `\n[knesset] done: ${writer.written} laws written ` +
    `(${ingested} with text, ${metadataOnly} metadata-only, ${matchRate}% match-rate), ` +
    `${sectionTotal} sections${embed ? `, ${embedded} embedded` : ''}, ${Math.round(elapsedMs / 1000)}s.\n` +
    `[knesset] artifact: ${opts.out}\n`,
  );

  // GitHub Actions summary annotation (visible in the Summary tab).
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    process.stdout.write(
      `::notice title=Ingestion complete::laws=${writer.written} ingested=${ingested} ` +
      `metadata_only=${metadataOnly} match_rate=${matchRate}% sections=${sectionTotal}` +
      (embed ? ` embedded=${embedded}` : '') + ` elapsed=${Math.round(elapsedMs / 1000)}s\n`,
    );
  }

  // Write corpus manifest alongside the artifact.
  const manifestPath = join(dirname(opts.out), 'corpus-manifest.json');
  const manifest = {
    schemaVersion:    1,
    generatedAt:      new Date().toISOString(),
    buildId:          process.env['GITHUB_RUN_ID'] ?? null,
    lawCount:         writer.written,
    ingestedCount:    ingested,
    metadataOnlyCount: metadataOnly,
    sectionCount:     sectionTotal,
    matchRate,
    hasEmbeddings:    embedded > 0,
    embeddingModel:   embedded > 0 ? 'nomic-embed-text' : null,
    embeddedSectionCount: embedded > 0 ? embedded : null,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  process.stdout.write(`[knesset] manifest: ${manifestPath}\n`);

  return { written: writer.written, ingested, metadataOnly, sections: sectionTotal, embedded, matchRate, elapsedMs };
}
