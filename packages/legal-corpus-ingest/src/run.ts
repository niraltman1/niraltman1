import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { iterateValidLaws, countValidLaws, ODATA_BASE, type ValidLaw } from './odata-registry.js';
import { resolveLaw, type WikiResolution } from './wiki-resolve.js';
import { structureLaw } from './structure.js';
import { ArtifactWriter, type EmbeddingRec } from './artifact.js';

const EMBED_MAX_CHARS = 6_000; // keep nomic-embed-text inputs within its context window

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
  const base = opts.base ?? ODATA_BASE;
  const delayMs = opts.delayMs ?? 300;
  await mkdir(dirname(opts.out), { recursive: true });

  const embed = opts.embed ? await loadEmbed() : null;

  let total = 0;
  try { total = await countValidLaws(base); } catch { /* progress display only */ }
  process.stdout.write(`[knesset] valid laws: ${total || '?'} · out: ${opts.out}${embed ? ' · +embeddings' : ''}\n`);

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

  // Pass 1. Laws that fail ONLY due to a transient API error are deferred (never written as
  // metadata-only on a rate-limit blip) and retried gently in pass 2.
  const retryQueue: ValidLaw[] = [];
  for await (const law of iterateValidLaws({ base })) {
    if (opts.only && !opts.only.has(law.israelLawId)) continue;
    if (opts.limit != null && processed >= opts.limit) break;
    processed += 1;

    const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs });
    if (!resolved.matched && resolved.transient) { retryQueue.push(law); }
    else { await processLaw(law, resolved); }

    // Few-law smoke runs: stop once every requested id has been seen.
    if (opts.only && processed >= opts.only.size) break;
  }

  // Pass 2. One gentler retry (3× the delay) so transient WikiSource rate-limiting never
  // silently demotes a law that actually has text to a metadata-only row.
  if (retryQueue.length > 0) {
    process.stdout.write(`[knesset] retrying ${retryQueue.length} transient failure(s) at ${delayMs * 3}ms...\n`);
    for (const law of retryQueue) {
      const resolved = await resolveLaw(law.israelLawId, law.name, { delayMs: delayMs * 3 });
      await processLaw(law, resolved);
    }
  }

  await writer.close();
  const matchRate = processed ? Math.round((ingested / processed) * 1000) / 10 : 0;
  process.stdout.write(
    `\n[knesset] done: ${writer.written} laws written ` +
    `(${ingested} with text, ${metadataOnly} metadata-only, ${matchRate}% match-rate), ` +
    `${sectionTotal} sections${embed ? `, ${embedded} embedded` : ''}.\n` +
    `[knesset] artifact: ${opts.out}\n`,
  );

  return { written: writer.written, ingested, metadataOnly, sections: sectionTotal, embedded, matchRate };
}
