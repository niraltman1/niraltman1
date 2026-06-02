import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VerdictCorpusRepository, VerdictInput } from '@factum-il/database';
import { logger } from '@factum-il/shared';
import { rawRowToVerdict, rawGuychukRowToVerdict, type DatasetProvenance } from './transform.js';

export interface IngestResult {
  ingested: number;
  skipped:  number;
}

/** A dataset that feeds the verbatim verdict corpus: provenance + how to read & map it. */
export interface VerdictSource {
  key:        string;   // CLI selector, e.g. 'supreme' | 'all-courts'
  config:     string;   // HF datasets-server config
  split:      string;   // HF datasets-server split
  provenance: DatasetProvenance;
  transform:  (row: Record<string, unknown>, prov: DatasetProvenance) => VerdictInput | null;
}

/**
 * Verbatim verdict sources. Provenance is hardcoded — never read from user input — so
 * every stored ruling self-documents its origin, snapshot, and license. doc_key spaces
 * are kept distinct per source (see transforms) so the two never collide in one table.
 */
export const SUPREME_COURT_PROVENANCE: DatasetProvenance = {
  sourceDataset: 'LevMuchnik/SupremeCourtOfIsrael',
  snapshotLabel: '2022',
  sourceLicense: 'openrail',
};

/**
 * guychuk/case-law-israel covers the FULL court hierarchy (district, magistrate,
 * family, labor, traffic, …) — complementing the Supreme-Court-only source above.
 * ⚠️ Its dataset card declares NO license; we record 'unspecified' so it is flagged
 * for license verification before any production reliance.
 */
export const GUYCHUK_PROVENANCE: DatasetProvenance = {
  sourceDataset: 'guychuk/case-law-israel',
  snapshotLabel: '2025',
  sourceLicense: 'unspecified',
};

export const SUPREME_COURT_SOURCE: VerdictSource = {
  key: 'supreme', config: 'default', split: 'train',
  provenance: SUPREME_COURT_PROVENANCE, transform: rawRowToVerdict,
};

export const ALL_COURTS_SOURCE: VerdictSource = {
  key: 'all-courts', config: 'default', split: 'judgments',
  provenance: GUYCHUK_PROVENANCE, transform: rawGuychukRowToVerdict,
};

export const VERDICT_SOURCES: Record<string, VerdictSource> = {
  [SUPREME_COURT_SOURCE.key]: SUPREME_COURT_SOURCE,
  [ALL_COURTS_SOURCE.key]:    ALL_COURTS_SOURCE,
};

/**
 * Ingest already-parsed dataset rows into the verbatim verdict corpus, using the given
 * source's transform. Each row is upserted (idempotent by doc key). Rows without a
 * stable key or ruling text are skipped and counted — never faked.
 */
export async function ingestRows(
  repo: VerdictCorpusRepository,
  rows: Iterable<Record<string, unknown>>,
  source: VerdictSource = SUPREME_COURT_SOURCE,
  embed?: (text: string) => Promise<number[] | null>,
): Promise<IngestResult> {
  let ingested = 0;
  let skipped  = 0;
  for (const row of rows) {
    const input = source.transform(row, source.provenance);
    if (!input) { skipped++; continue; }
    const id = repo.upsertVerdict(input);
    ingested++;
    if (embed) {
      try {
        // Embed a bounded prefix — rulings can be very long; the head carries the
        // header, parties, and holding, which is what retrieval keys on.
        const vec = await embed(input.verbatimText.slice(0, 2000));
        if (vec) repo.upsertEmbedding(id, vec);
      } catch (err) {
        logger.warn(`[verdict-corpus] embed failed for ${input.docKey}: ${String(err)}`, { category: 'system' });
      }
    }
  }
  return { ingested, skipped };
}

/**
 * Read newline-delimited JSON rows from every *.jsonl file in a directory. Use this for
 * offline ingestion when network egress to Hugging Face is restricted: export the
 * dataset to JSONL once (where allowed) and drop the files in a folder.
 */
export function* readJsonlDir(dir: string): Generator<Record<string, unknown>> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        yield JSON.parse(trimmed) as Record<string, unknown>;
      } catch (err) {
        logger.warn(`[verdict-corpus] bad JSONL line in ${file}: ${String(err)}`, { category: 'system' });
      }
    }
  }
}

/**
 * Fetch a page of rows from the Hugging Face datasets-server. READY FOR USE once
 * `datasets-server.huggingface.co` is added to the environment network allowlist —
 * until then this throws a clear, actionable error rather than hanging.
 */
export async function fetchVerdictRowsPage(
  source: VerdictSource = SUPREME_COURT_SOURCE,
  opts: { offset?: number; length?: number } = {},
): Promise<Record<string, unknown>[]> {
  const dataset = source.provenance.sourceDataset;
  const config  = source.config;
  const split   = source.split;
  const offset  = opts.offset  ?? 0;
  const length  = Math.min(opts.length ?? 100, 100); // datasets-server caps at 100/req
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}`
    + `&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}`
    + `&offset=${offset}&length=${length}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Factum-IL/verdict-corpus (local legal KB ingester)' } });
  } catch (err) {
    throw new Error(
      `Cannot reach Hugging Face datasets-server (${String(err)}). `
      + 'Add datasets-server.huggingface.co to the environment network allowlist.',
    );
  }
  if (!res.ok) {
    throw new Error(`datasets-server returned HTTP ${res.status} for ${dataset}.`);
  }
  const body = await res.json() as { rows?: { row: Record<string, unknown> }[] };
  return (body.rows ?? []).map((r) => r.row);
}
