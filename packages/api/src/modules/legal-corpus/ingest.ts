import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LegalCorpusRepository } from '@factum-il/database';
import { logger } from '@factum-il/shared';
import { LEGAL_CORPUS_MANIFEST, entryUrl, type ManifestEntry } from './manifest.js';
import { parseLawHtml } from './parser.js';

export interface IngestOptions {
  /** Read HTML from `<localDir>/<sourceKey>.html` instead of fetching (works offline). */
  localDir?: string;
  /** Generate per-section embeddings via `embed` (requires Ollama). */
  embed?: (text: string) => Promise<number[] | null>;
  /** Restrict to specific source keys. */
  only?: string[];
}

export interface IngestResult {
  sourceKey: string;
  ok:        boolean;
  sections:  number;
  embedded:  number;
  reason?:   string;
}

/** Fetches one source's HTML over the network. Returns null on any failure. */
async function fetchHtml(entry: ManifestEntry): Promise<string | null> {
  const url = entryUrl(entry);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Factum-IL/legal-corpus (local legal KB ingester)' },
      signal:  AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      logger.warn(`[legal-corpus] fetch ${entry.sourceKey} → HTTP ${res.status}`, { category: 'system' });
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.warn(`[legal-corpus] fetch ${entry.sourceKey} failed: ${String(err)}`, { category: 'system' });
    return null;
  }
}

function loadLocal(localDir: string, sourceKey: string): string | null {
  const path = join(localDir, `${sourceKey}.html`);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Ingests one law: source upserted, sections replaced atomically (isolated to this
 * source), embeddings optional. Never throws — a failure for one source is reported
 * and does not affect the others. Verbatim only: text comes from the fetched/local
 * HTML, sliced by the parser; nothing is authored.
 */
export async function ingestOne(
  repo: LegalCorpusRepository,
  entry: ManifestEntry,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const html = opts.localDir ? loadLocal(opts.localDir, entry.sourceKey) : await fetchHtml(entry);
  if (!html) {
    return { sourceKey: entry.sourceKey, ok: false, sections: 0, embedded: 0,
      reason: opts.localDir ? 'no local file' : 'fetch failed (network/host_not_allowed?)' };
  }

  const sections = parseLawHtml(html);
  if (sections.length === 0) {
    return { sourceKey: entry.sourceKey, ok: false, sections: 0, embedded: 0, reason: 'empty after parse' };
  }

  const sourceId = repo.upsertSource({
    sourceKey:       entry.sourceKey,
    titleHe:         entry.titleHe,
    shortName:       entry.shortName,
    citation:        entry.citation,
    sourceType:      entry.sourceType,
    procedureDomain: entry.procedureDomain,
    sourceUrl:       entryUrl(entry),
    year:            entry.year,
  });
  const written = repo.replaceSections(sourceId, sections);

  let embedded = 0;
  if (opts.embed) {
    for (const s of repo.getSections(sourceId)) {
      const vec = await opts.embed(s.verbatimText);
      if (vec) { repo.upsertEmbedding(s.id, sourceId, vec); embedded += 1; }
    }
  }
  return { sourceKey: entry.sourceKey, ok: true, sections: written, embedded };
}

/** Ingests every (or a filtered subset of) manifest source. Never throws. */
export async function ingestAll(
  repo: LegalCorpusRepository,
  opts: IngestOptions = {},
): Promise<IngestResult[]> {
  const entries = opts.only
    ? LEGAL_CORPUS_MANIFEST.filter((e) => opts.only!.includes(e.sourceKey))
    : LEGAL_CORPUS_MANIFEST;

  const results: IngestResult[] = [];
  for (const entry of entries) {
    try {
      results.push(await ingestOne(repo, entry, opts));
    } catch (err) {
      results.push({ sourceKey: entry.sourceKey, ok: false, sections: 0, embedded: 0, reason: String(err) });
    }
  }
  return results;
}
