import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { iterateValidLaws, ODATA_BASE, type ValidLaw } from './odata-registry.js';
import { resolveLaw, type WikiResolution } from './wiki-resolve.js';
import { structureLaw, shortName } from './structure.js';
import { ArtifactWriter, partialPath, type EmbeddingRec } from './artifact.js';
import { inferProcedureDomain, ALL_DOMAINS, type LegalDomain } from './domain-classify.js';

const EMBED_MAX_CHARS = 6_000; // keep nomic-embed-text inputs within its context window
const WIKI_CONCURRENCY = 8;   // parallel WikiSource resolutions (~0.29 req/s at 28s/call, well below Wikimedia limits)

export interface RunOptions {
  out:        string;           // artifact file path, OR output directory when batchSize > 0
  embed?:     boolean;          // generate per-section embeddings (requires Ollama)
  limit?:     number | null;    // cap laws processed (smoke testing)
  only?:      Set<number> | null; // restrict to specific IsraelLawIDs (smoke testing)
  delayMs?:   number;           // politeness delay between WikiSource requests
  base?:      string;           // OData base URL override
  batchSize?:    number;           // > 0 → numeric batch mode (N laws per file); 0/undefined → single-file
  domainBatches?: boolean;         // true → domain-based files (batch-criminal.jsonl.gz etc.)
}

export interface RunSummary {
  written:      number;
  ingested:     number;
  metadataOnly: number;
  sections:     number;
  embedded:     number;
  matchRate:    number;         // % of processed laws that resolved to full text
  elapsedMs:    number;
}

interface BatchCounters {
  ingested:     number;
  metadataOnly: number;
  sectionTotal: number;
  embedded:     number;
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
        if (active < concurrency) { attempt(); } else { queue.push(attempt); }
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
 * Run one slice of laws through WikiSource (P=8 parallel) + pass-2 retry for transient
 * failures. Writes each structured record directly into `writer` and accumulates counts
 * in `counters`. Shared by both batch mode and single-file mode.
 */
async function runSlice(
  laws: ValidLaw[],
  writer: ArtifactWriter,
  counters: BatchCounters,
  opts: { delayMs: number; embed: ((t: string) => Promise<number[] | null>) | null },
): Promise<void> {
  const retryQueue: ValidLaw[] = [];
  const pool = createPool(WIKI_CONCURRENCY);

  const processOne = async (law: ValidLaw, resolved: WikiResolution): Promise<void> => {
    const rec = structureLaw(law, resolved);
    if (rec.status === 'ingested') {
      counters.ingested    += 1;
      counters.sectionTotal += rec.sections.length;
      if (opts.embed) {
        const embs: EmbeddingRec[] = [];
        for (const s of rec.sections) {
          const vec = await opts.embed(s.verbatimText.slice(0, EMBED_MAX_CHARS));
          if (vec) {
            embs.push({ orderIndex: s.orderIndex, model: 'nomic-embed-text', vector: vec });
            counters.embedded += 1;
          }
        }
        rec.embeddings = embs;
      }
    } else {
      counters.metadataOnly += 1;
    }
    writer.write(rec);
  };

  await Promise.all(laws.map((law) => pool.run(async () => {
    const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs: opts.delayMs });
    if (!resolved.matched && resolved.transient) { retryQueue.push(law); }
    else { await processOne(law, resolved); }
  })));

  if (retryQueue.length > 0) {
    process.stdout.write(`[knesset] retrying ${retryQueue.length} transient failure(s) at ${opts.delayMs * 3}ms...\n`);
    for (const law of retryQueue) {
      const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs: opts.delayMs * 3 });
      await processOne(law, resolved);
    }
  }
}

function writeManifest(
  filePath: string,
  fields: {
    batchSize?: number; batchCount?: number;
    lawCount: number; ingestedCount: number; metadataOnlyCount: number;
    sectionCount: number; matchRate: number;
    embedded: number;
  },
): Promise<void> {
  const manifest = {
    schemaVersion:       1,
    generatedAt:         new Date().toISOString(),
    buildId:             process.env['GITHUB_RUN_ID'] ?? null,
    ...(fields.batchSize != null ? { batchSize: fields.batchSize, batchCount: fields.batchCount } : {}),
    lawCount:            fields.lawCount,
    ingestedCount:       fields.ingestedCount,
    metadataOnlyCount:   fields.metadataOnlyCount,
    sectionCount:        fields.sectionCount,
    matchRate:           fields.matchRate,
    hasEmbeddings:       fields.embedded > 0,
    embeddingModel:      fields.embedded > 0 ? 'nomic-embed-text' : null,
    embeddedSectionCount: fields.embedded > 0 ? fields.embedded : null,
  };
  return writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Hybrid ingestion: Knesset OData registry × WikiSource verbatim full text.
 *
 * Two modes selected by `opts.batchSize`:
 *
 *   batchSize > 0  (BATCH MODE, default when using --batch-size flag)
 *     `opts.out` is a **directory**. Laws are sorted by israelLawId, split into batches of
 *     `batchSize`, and written to `batch-NNNN.jsonl.gz` files sequentially. Each completed
 *     file is its own checkpoint — if a file already exists it is skipped on re-run.
 *     A `corpus-manifest.json` is written to the same directory at the end.
 *
 *   batchSize === 0 (SINGLE-FILE MODE, legacy default)
 *     `opts.out` is a **file path** (`.gz` → gzip). All laws go into one artifact.
 *     A `.partial.jsonl` checkpoint allows resume across interrupted runs.
 */
export async function runIngestion(opts: RunOptions): Promise<RunSummary> {
  const startMs = Date.now();
  const base     = opts.base    ?? ODATA_BASE;
  const delayMs  = opts.delayMs ?? 300;
  const batchSize = opts.batchSize ?? 0;
  const embed    = opts.embed ? await loadEmbed() : null;

  // ── Pass 0: collect all valid law IDs from OData (~11 pages, ~6 s) ────────────────────────
  process.stdout.write(`[knesset] fetching OData registry...\n`);
  const allLaws: ValidLaw[] = [];
  for await (const law of iterateValidLaws({ base })) {
    if (opts.only && !opts.only.has(law.israelLawId)) continue;
    allLaws.push(law);
    if (opts.only && allLaws.length >= opts.only.size) break;
    if (opts.limit != null && allLaws.length >= opts.limit) break;
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  //  DOMAIN BATCH MODE
  // ────────────────────────────────────────────────────────────────────────────────────────────
  if (opts.domainBatches) {
    const outDir = opts.out;
    await mkdir(outDir, { recursive: true });

    // Group laws by primary domain, sort each group deterministically.
    const domainMap = new Map<LegalDomain, ValidLaw[]>();
    for (const d of ALL_DOMAINS) domainMap.set(d, []);
    for (const law of allLaws) {
      domainMap.get(inferProcedureDomain(law.name))!.push(law);
    }
    for (const laws of domainMap.values()) {
      laws.sort((a, b) => a.israelLawId - b.israelLawId);
    }

    const otherCount = domainMap.get('other')!.length;
    if (otherCount > 30) {
      process.stderr.write(
        `[knesset] WARNING: ${otherCount} laws fell to 'other' domain (>30 threshold). ` +
        `Update domain-classify.ts to improve coverage.\n`,
      );
    }

    process.stdout.write(`[knesset] ${allLaws.length} laws → domain batches · dir: ${outDir}\n`);

    const totals: BatchCounters = { ingested: 0, metadataOnly: 0, sectionTotal: 0, embedded: 0 };
    let skipped = 0;

    // Build domain index from the classified law list (comprehensive — includes skipped domains).
    type DomainEntry = { count: number; file: string; laws: Array<{ israelLawId: number; shortName: string }> };
    const domainEntries: Record<string, DomainEntry> = {};
    for (const d of ALL_DOMAINS) {
      const laws = domainMap.get(d)!;
      if (laws.length === 0) continue;
      domainEntries[d] = {
        count: laws.length,
        file:  `batch-${d}.jsonl.gz`,
        laws:  laws.map((l) => ({ israelLawId: l.israelLawId, shortName: shortName(l.name) })),
      };
    }

    for (const d of ALL_DOMAINS) {
      const laws = domainMap.get(d)!;
      if (laws.length === 0) continue;

      const batchPath = join(outDir, `batch-${d}.jsonl.gz`);
      if (existsSync(batchPath)) {
        process.stdout.write(`[knesset] domain '${d}' already done (${laws.length} laws) — skipping\n`);
        skipped += 1;
        continue;
      }

      const batchStart = Date.now();
      process.stdout.write(`[knesset] domain '${d}': processing ${laws.length} laws...\n`);

      const counters: BatchCounters = { ingested: 0, metadataOnly: 0, sectionTotal: 0, embedded: 0 };
      const writer = new ArtifactWriter(batchPath);
      await runSlice(laws, writer, counters, { delayMs, embed });
      await writer.close();

      totals.ingested     += counters.ingested;
      totals.metadataOnly += counters.metadataOnly;
      totals.sectionTotal += counters.sectionTotal;
      totals.embedded     += counters.embedded;

      const elapsed = Math.round((Date.now() - batchStart) / 1000);
      process.stdout.write(
        `[knesset] domain '${d}' saved: ${counters.ingested} ingested, ` +
        `${counters.metadataOnly} metadata-only, ${counters.sectionTotal} sections (${elapsed}s)\n`,
      );
      if (process.env['GITHUB_ACTIONS'] === 'true') {
        process.stdout.write(
          `::notice title=Domain ${d}::ingested=${counters.ingested} ` +
          `metadata_only=${counters.metadataOnly} sections=${counters.sectionTotal} elapsed=${elapsed}s\n`,
        );
      }
    }

    const totalWritten = totals.ingested + totals.metadataOnly;
    const elapsedMs    = Date.now() - startMs;
    const matchRate    = totalWritten > 0 ? Math.round((totals.ingested / totalWritten) * 1000) / 10 : 0;

    const domainIndexPath = join(outDir, 'corpus-domain-index.json');
    await writeFile(domainIndexPath, JSON.stringify({
      schemaVersion: 1,
      generatedAt:   new Date().toISOString(),
      totalLaws:     allLaws.length,
      domains:       domainEntries,
    }, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[knesset] domain index: ${domainIndexPath}\n`);

    process.stdout.write(
      `\n[knesset] done: ${Object.keys(domainEntries).length} domains (${skipped} skipped), ` +
      `${totalWritten} laws written (${totals.ingested} with text, ${totals.metadataOnly} metadata-only, ` +
      `${matchRate}% match-rate), ${totals.sectionTotal} sections, ${Math.round(elapsedMs / 1000)}s.\n`,
    );
    if (process.env['GITHUB_ACTIONS'] === 'true') {
      process.stdout.write(
        `::notice title=Ingestion complete::domains=${Object.keys(domainEntries).length} skipped=${skipped} ` +
        `laws=${totalWritten} ingested=${totals.ingested} match_rate=${matchRate}% ` +
        `sections=${totals.sectionTotal} elapsed=${Math.round(elapsedMs / 1000)}s\n`,
      );
    }

    const manifestPath = join(outDir, 'corpus-manifest.json');
    await writeManifest(manifestPath, {
      lawCount: allLaws.length, ingestedCount: totals.ingested,
      metadataOnlyCount: totals.metadataOnly, sectionCount: totals.sectionTotal,
      matchRate, embedded: totals.embedded,
    });
    process.stdout.write(`[knesset] manifest: ${manifestPath}\n`);

    return {
      written:      totalWritten,
      ingested:     totals.ingested,
      metadataOnly: totals.metadataOnly,
      sections:     totals.sectionTotal,
      embedded:     totals.embedded,
      matchRate,
      elapsedMs,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  //  NUMERIC BATCH MODE
  // ────────────────────────────────────────────────────────────────────────────────────────────
  if (batchSize > 0) {
    const outDir = opts.out;
    await mkdir(outDir, { recursive: true });

    // Sort deterministically so batch N always contains the same law IDs on every run.
    const sorted = allLaws.slice().sort((a, b) => a.israelLawId - b.israelLawId);

    const batches: ValidLaw[][] = [];
    for (let i = 0; i < sorted.length; i += batchSize) {
      batches.push(sorted.slice(i, i + batchSize));
    }

    process.stdout.write(
      `[knesset] ${sorted.length} laws → ${batches.length} batches of ≤${batchSize} · dir: ${outDir}\n`,
    );

    const totals: BatchCounters = { ingested: 0, metadataOnly: 0, sectionTotal: 0, embedded: 0 };
    let skipped = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch   = batches[i]!;
      const batchNum = String(i + 1).padStart(4, '0');
      const batchPath = join(outDir, `batch-${batchNum}.jsonl.gz`);

      if (existsSync(batchPath)) {
        process.stdout.write(`[knesset] batch ${batchNum} already done — skipping\n`);
        skipped += 1;
        continue;
      }

      const batchStart = Date.now();
      process.stdout.write(`[knesset] batch ${batchNum}: processing ${batch.length} laws...\n`);

      const counters: BatchCounters = { ingested: 0, metadataOnly: 0, sectionTotal: 0, embedded: 0 };
      const writer = new ArtifactWriter(batchPath);
      await runSlice(batch, writer, counters, { delayMs, embed });
      await writer.close();

      totals.ingested     += counters.ingested;
      totals.metadataOnly += counters.metadataOnly;
      totals.sectionTotal += counters.sectionTotal;
      totals.embedded     += counters.embedded;

      const elapsed = Math.round((Date.now() - batchStart) / 1000);
      process.stdout.write(
        `[knesset] batch ${batchNum} saved: ${counters.ingested} ingested, ` +
        `${counters.metadataOnly} metadata-only, ${counters.sectionTotal} sections (${elapsed}s)\n`,
      );

      if (process.env['GITHUB_ACTIONS'] === 'true') {
        process.stdout.write(
          `::notice title=Batch ${batchNum}::ingested=${counters.ingested} ` +
          `metadata_only=${counters.metadataOnly} sections=${counters.sectionTotal} elapsed=${elapsed}s\n`,
        );
      }
    }

    const totalWritten = totals.ingested + totals.metadataOnly;
    const elapsedMs    = Date.now() - startMs;
    const matchRate    = totalWritten > 0 ? Math.round((totals.ingested / totalWritten) * 1000) / 10 : 0;

    process.stdout.write(
      `\n[knesset] done: ${batches.length} batches (${skipped} skipped), ` +
      `${totalWritten} laws (${totals.ingested} with text, ${totals.metadataOnly} metadata-only, ` +
      `${matchRate}% match-rate), ${totals.sectionTotal} sections, ${Math.round(elapsedMs / 1000)}s.\n`,
    );

    if (process.env['GITHUB_ACTIONS'] === 'true') {
      process.stdout.write(
        `::notice title=Ingestion complete::batches=${batches.length} skipped=${skipped} ` +
        `laws=${totalWritten} ingested=${totals.ingested} match_rate=${matchRate}% ` +
        `sections=${totals.sectionTotal} elapsed=${Math.round(elapsedMs / 1000)}s\n`,
      );
    }

    const manifestPath = join(outDir, 'corpus-manifest.json');
    await writeManifest(manifestPath, {
      batchSize, batchCount: batches.length,
      lawCount: totalWritten, ingestedCount: totals.ingested,
      metadataOnlyCount: totals.metadataOnly, sectionCount: totals.sectionTotal,
      matchRate, embedded: totals.embedded,
    });
    process.stdout.write(`[knesset] manifest: ${manifestPath}\n`);

    return {
      written:     totalWritten,
      ingested:    totals.ingested,
      metadataOnly: totals.metadataOnly,
      sections:    totals.sectionTotal,
      embedded:    totals.embedded,
      matchRate,
      elapsedMs,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  //  SINGLE-FILE MODE (backward compatible)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  await mkdir(dirname(opts.out), { recursive: true });

  // Resume from a prior partial run if a checkpoint file exists.
  const checkpoint = partialPath(opts.out);
  const done = new Set<number>();
  if (existsSync(checkpoint)) {
    const raw = await readFile(checkpoint, 'utf-8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { done.add((JSON.parse(t) as { israelLawId: number }).israelLawId); } catch { /* skip */ }
    }
    process.stdout.write(
      `[knesset] resuming from checkpoint: ${done.size} laws already done, ${allLaws.length - done.size} remaining\n`,
    );
  }

  const lawsToProcess = done.size > 0 ? allLaws.filter((l) => !done.has(l.israelLawId)) : allLaws;
  process.stdout.write(
    `[knesset] ${lawsToProcess.length} laws to process · out: ${opts.out}` +
    `${embed ? ' · +embeddings' : ''}${done.size > 0 ? ` (resumed — ${done.size} skipped)` : ''}\n`,
  );

  const writer   = new ArtifactWriter(opts.out);
  const counters: BatchCounters = { ingested: 0, metadataOnly: 0, sectionTotal: 0, embedded: 0 };

  // Replay already-done records into the new output so the final artifact is complete.
  if (done.size > 0) {
    const raw = await readFile(checkpoint, 'utf-8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t) as Parameters<typeof writer.write>[0];
        writer.write(rec);
        if (rec.status === 'ingested') { counters.ingested += 1; counters.sectionTotal += rec.sections.length; }
        else { counters.metadataOnly += 1; }
      } catch { /* skip corrupt lines */ }
    }
  }

  // Process remaining laws with progress counter every 100 laws.
  let processed = 0;
  const total       = allLaws.length;
  const retryQueue: ValidLaw[] = [];
  const pool = createPool(WIKI_CONCURRENCY);

  const processOneSF = async (law: ValidLaw, resolved: WikiResolution): Promise<void> => {
    const rec = structureLaw(law, resolved);
    if (rec.status === 'ingested') {
      counters.ingested    += 1;
      counters.sectionTotal += rec.sections.length;
      if (embed) {
        const embs: EmbeddingRec[] = [];
        for (const s of rec.sections) {
          const vec = await embed(s.verbatimText.slice(0, EMBED_MAX_CHARS));
          if (vec) {
            embs.push({ orderIndex: s.orderIndex, model: 'nomic-embed-text', vector: vec });
            counters.embedded += 1;
          }
        }
        rec.embeddings = embs;
      }
      process.stdout.write(`  ✓ ${String(law.israelLawId).padEnd(8)} ${rec.shortName} — ${rec.sections.length} sections\n`);
    } else {
      counters.metadataOnly += 1;
      process.stdout.write(`  · ${String(law.israelLawId).padEnd(8)} ${rec.shortName} — metadata-only\n`);
    }
    writer.write(rec);
  };

  await Promise.all(lawsToProcess.map((law) => pool.run(async () => {
    const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs });
    processed += 1;
    if (processed % 100 === 0) {
      const sofar = done.size + processed;
      const pct   = Math.round((sofar / total) * 100);
      process.stdout.write(`[knesset] progress: ${sofar}/${total} (${pct}%) — elapsed ${Math.round((Date.now() - startMs) / 1000)}s\n`);
    }
    if (!resolved.matched && resolved.transient) { retryQueue.push(law); }
    else { await processOneSF(law, resolved); }
  })));

  if (retryQueue.length > 0) {
    process.stdout.write(`[knesset] retrying ${retryQueue.length} transient failure(s) at ${delayMs * 3}ms...\n`);
    for (const law of retryQueue) {
      const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs: delayMs * 3 });
      await processOneSF(law, resolved);
    }
  }

  await writer.close();
  const elapsedMs = Date.now() - startMs;
  const matchRate  = processed ? Math.round((counters.ingested / processed) * 1000) / 10 : 0;

  process.stdout.write(
    `\n[knesset] done: ${writer.written} laws written ` +
    `(${counters.ingested} with text, ${counters.metadataOnly} metadata-only, ${matchRate}% match-rate), ` +
    `${counters.sectionTotal} sections${embed ? `, ${counters.embedded} embedded` : ''}, ${Math.round(elapsedMs / 1000)}s.\n` +
    `[knesset] artifact: ${opts.out}\n`,
  );

  if (process.env['GITHUB_ACTIONS'] === 'true') {
    process.stdout.write(
      `::notice title=Ingestion complete::laws=${writer.written} ingested=${counters.ingested} ` +
      `metadata_only=${counters.metadataOnly} match_rate=${matchRate}% sections=${counters.sectionTotal}` +
      (embed ? ` embedded=${counters.embedded}` : '') + ` elapsed=${Math.round(elapsedMs / 1000)}s\n`,
    );
  }

  const manifestPath = join(dirname(opts.out), 'corpus-manifest.json');
  await writeManifest(manifestPath, {
    lawCount: writer.written, ingestedCount: counters.ingested,
    metadataOnlyCount: counters.metadataOnly, sectionCount: counters.sectionTotal,
    matchRate, embedded: counters.embedded,
  });
  process.stdout.write(`[knesset] manifest: ${manifestPath}\n`);

  return {
    written:     writer.written,
    ingested:    counters.ingested,
    metadataOnly: counters.metadataOnly,
    sections:    counters.sectionTotal,
    embedded:    counters.embedded,
    matchRate,
    elapsedMs,
  };
}
