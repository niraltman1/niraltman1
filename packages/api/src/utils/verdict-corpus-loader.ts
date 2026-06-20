import { existsSync, createReadStream, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { logger } from '@factum-il/shared';
import type { Repos } from '../db.js';
import type { VerdictInput } from '@factum-il/database';
import {
  rawGuychukRowToVerdict,
  rawRowToVerdict,
  type DatasetProvenance,
} from '../modules/verdict-corpus/transform.js';
import { GUYCHUK_PROVENANCE, SUPREME_COURT_PROVENANCE } from '../modules/verdict-corpus/ingest.js';

const BATCH_SIZE      = 500;
const MIN_TEXT_LENGTH = 50;

const __dirname = dirname(fileURLToPath(import.meta.url));
// FACTUM_IL_ROOT is set by the installer to {app}\app; in the monorepo we resolve
// from dist/utils → api → packages → repo-root (same shape as legal-corpus-loader.ts).
const REPO_ROOT = process.env['FACTUM_IL_ROOT'] ?? join(__dirname, '..', '..', '..', '..');

/**
 * One bundled verdict dataset. The installer stages every dataset's `.jsonl.gz`
 * into `verdict-corpus/`; each loads into the SAME `VerdictCorpus` table but tracks
 * its own idempotency/resume state under a distinct SystemSettings key prefix so the
 * datasets never overwrite each other's progress.
 */
interface VerdictDataset {
  readonly name:         string; // log/telemetry label
  readonly fileName:     string; // gzip artifact in verdict-corpus/
  readonly metaFileName: string; // companion metadata (corpus version)
  readonly idField:      string; // raw-row id column (validation)
  readonly textField:    string; // raw-row text column (validation)
  readonly transform:    (row: Record<string, unknown>, prov: DatasetProvenance) => VerdictInput | null;
  readonly provenance:   DatasetProvenance;
  readonly keys:         { sig: string; sha256: string; version: string; progress: string };
}

// guychuk keeps the original `verdict_corpus_*` keys so installs that already loaded
// it before the Supreme Court corpus was added do NOT re-import on upgrade.
const VERDICT_DATASETS: readonly VerdictDataset[] = [
  {
    name:         'guychuk',
    fileName:     'case-law-il.jsonl.gz',
    metaFileName: 'corpus-metadata.json',
    idField:      'judgment_id',
    textField:    'document_text',
    transform:    rawGuychukRowToVerdict,
    provenance:   GUYCHUK_PROVENANCE,
    keys: {
      sig:      'verdict_corpus_artifact_sig',
      sha256:   'verdict_corpus_sha256',
      version:  'verdict_corpus_version',
      progress: 'verdict_corpus_progress',
    },
  },
  {
    name:         'supreme-court',
    fileName:     'supreme-court-il.jsonl.gz',
    metaFileName: 'supreme-court-metadata.json',
    idField:      'document_hash',
    textField:    'text',
    transform:    rawRowToVerdict,
    provenance:   SUPREME_COURT_PROVENANCE,
    keys: {
      sig:      'supreme_court_corpus_artifact_sig',
      sha256:   'supreme_court_corpus_sha256',
      version:  'supreme_court_corpus_version',
      progress: 'supreme_court_corpus_progress',
    },
  },
];

// Per-dataset in-process load guard (keyed by dataset name).
const _loaded = new Set<string>();

function resolveArtifactPath(
  fileName: string,
  metaFileName: string,
): { jsonl: string; meta: string | null } | null {
  const bases = [
    join(REPO_ROOT, 'verdict-corpus'),
    join(REPO_ROOT, 'assets', 'verdict-corpus'),
  ];
  for (const base of bases) {
    const jsonl = join(base, fileName);
    if (existsSync(jsonl)) {
      const meta = join(base, metaFileName);
      return { jsonl, meta: existsSync(meta) ? meta : null };
    }
  }
  return null;
}

function artifactSignature(path: string): string {
  const st = statSync(path);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

// Compute SHA-256 of a file by streaming it — called once per new artifact, then cached.
async function computeSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end',  () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function readSetting(repos: Repos, key: string): string | null {
  try {
    const row = repos.db.prepare('SELECT value FROM SystemSettings WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row?.value ?? null;
  } catch { return null; }
}

function writeSetting(repos: Repos, key: string, value: string): void {
  try {
    repos.db.prepare(`
      INSERT INTO SystemSettings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(key, value);
  } catch { /* best-effort — missing table just means we reload next boot */ }
}

/** Coerce a raw id column (string or number) into a trimmed non-empty string, or ''. */
function idString(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  return '';
}

function validateRow(
  row: Record<string, unknown>,
  idField: string,
  textField: string,
): string | null {
  if (!idString(row[idField])) return 'missing_id';
  const text = typeof row[textField] === 'string' ? (row[textField] as string).trim() : '';
  if (!text)                         return 'missing_text';
  if (text.length < MIN_TEXT_LENGTH) return 'text_too_short';
  return null; // valid
}

interface IngestTelemetry {
  linesRead:       number;
  ingested:        number;
  skipped:         number;
  rejected:        number;
  rejectionReasons: Record<string, number>;
  batchesCompleted: number;
  elapsedMs:       number;
}

/**
 * First-run loader for ONE bundled verdict dataset. Reads
 * `verdict-corpus/<dataset.fileName>` produced by the corresponding ingest CI
 * workflow and imports it into `VerdictCorpus` via `VerdictCorpusRepository`.
 *
 * Behaviour:
 *   - Idempotent: skips load when SHA-256 of the artifact is unchanged.
 *   - Resumable: persists the last committed line number in SystemSettings
 *     so a crash mid-load resumes from the checkpoint rather than restarting.
 *   - Graceful: if the artifact is absent (dev machine without full corpus),
 *     logs a hint and returns — never throws.
 */
async function loadDataset(repos: Repos, dataset: VerdictDataset): Promise<void> {
  if (_loaded.has(dataset.name)) return;
  _loaded.add(dataset.name);

  const paths = resolveArtifactPath(dataset.fileName, dataset.metaFileName);
  if (!paths) {
    logger.warn(
      `[verdict-corpus:${dataset.name}] artifact ${dataset.fileName} not found — skipping`,
      { category: 'system' },
    );
    return;
  }

  const { jsonl: artifactPath } = paths;

  // Quick sig check to skip unchanged artifacts before computing SHA-256
  const sig = artifactSignature(artifactPath);
  if (readSetting(repos, dataset.keys.sig) === sig) return;

  // SHA-256 integrity check
  const sha256 = await computeSha256(artifactPath);
  const storedSha = readSetting(repos, dataset.keys.sha256);
  if (storedSha && storedSha === sha256) {
    // Same content, different mtime (e.g. re-extracted) — update the sig and skip.
    writeSetting(repos, dataset.keys.sig, sig);
    return;
  }

  // Read corpus version from companion metadata file if available
  let corpusVersion = 'unknown';
  if (paths.meta) {
    try {
      const { readFileSync } = await import('node:fs');
      const meta = JSON.parse(readFileSync(paths.meta, 'utf-8')) as { version?: string };
      if (meta.version) corpusVersion = meta.version;
    } catch { /* metadata is optional */ }
  }

  const startMs = Date.now();

  // Resume support: read last committed line number
  const savedProgress = readSetting(repos, dataset.keys.progress);
  const resumeFrom    = savedProgress ? (Number(savedProgress) || 0) : 0;
  if (resumeFrom > 0) {
    logger.info(`[verdict-corpus:${dataset.name}] resuming from line ${resumeFrom}`, { category: 'system' });
  }

  const telemetry: IngestTelemetry = {
    linesRead: 0, ingested: 0, skipped: 0, rejected: 0,
    rejectionReasons: {}, batchesCompleted: 0, elapsedMs: 0,
  };

  const seenKeys = new Set<string>();
  let batch: VerdictInput[] = [];

  const flushBatch = (): void => {
    if (batch.length === 0) return;
    repos.verdictCorpus.bulkUpsert(batch);
    telemetry.ingested += batch.length;
    telemetry.batchesCompleted += 1;
    batch = [];
    // Persist checkpoint so a crash mid-load can resume
    writeSetting(repos, dataset.keys.progress, String(telemetry.linesRead));
  };

  logger.info(`[verdict-corpus:${dataset.name}] start — loading ${dataset.fileName}`, {
    category: 'system', event: 'verdict-corpus:start', dataset: dataset.name, corpusVersion,
  });

  const input = createReadStream(artifactPath).pipe(createGunzip());
  const rl    = createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    telemetry.linesRead += 1;
    if (telemetry.linesRead <= resumeFrom) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      telemetry.rejected += 1;
      telemetry.rejectionReasons['malformed_json'] =
        (telemetry.rejectionReasons['malformed_json'] ?? 0) + 1;
      continue;
    }

    const reason = validateRow(row, dataset.idField, dataset.textField);
    if (reason) {
      telemetry.rejected += 1;
      telemetry.rejectionReasons[reason] = (telemetry.rejectionReasons[reason] ?? 0) + 1;
      continue;
    }

    const verdict = dataset.transform(row, dataset.provenance);
    if (!verdict) { telemetry.skipped += 1; continue; }

    // Per-run dedup on the transform's namespaced docKey (guychuk:<id> vs raw hash)
    if (seenKeys.has(verdict.docKey)) {
      telemetry.rejected += 1;
      telemetry.rejectionReasons['duplicate_id'] =
        (telemetry.rejectionReasons['duplicate_id'] ?? 0) + 1;
      continue;
    }
    seenKeys.add(verdict.docKey);

    batch.push(verdict);
    if (batch.length >= BATCH_SIZE) flushBatch();

    // Periodic progress log every 2 000 rows
    if (telemetry.linesRead % 2_000 === 0) {
      logger.info(`[verdict-corpus:${dataset.name}] progress`, {
        category: 'system', event: 'verdict-corpus:progress', dataset: dataset.name,
        processed: telemetry.ingested, linesRead: telemetry.linesRead,
      });
    }
  }

  flushBatch(); // flush any remaining partial batch

  // Persist corpus version metadata and clear the in-progress checkpoint
  writeSetting(repos, dataset.keys.sig, sig);
  writeSetting(repos, dataset.keys.sha256, sha256);
  writeSetting(repos, dataset.keys.version, corpusVersion);
  writeSetting(repos, dataset.keys.progress, ''); // cleared — load complete

  telemetry.elapsedMs = Date.now() - startMs;

  logger.info(
    `[verdict-corpus:${dataset.name}] loaded ${telemetry.ingested} rulings, ${telemetry.skipped} skipped, ` +
    `${telemetry.rejected} rejected (${telemetry.batchesCompleted} batches) — ` +
    `${telemetry.elapsedMs}ms`,
    {
      category: 'system',
      event: 'verdict-corpus:completed',
      dataset: dataset.name,
      corpusVersion,
      sha256,
      ...telemetry,
    },
  );
}

/**
 * First-run loader for ALL bundled verdict corpora (guychuk full-hierarchy +
 * LevMuchnik Supreme Court). Each dataset is loaded independently and is
 * idempotent/resumable/graceful — a missing or already-loaded dataset is skipped
 * without affecting the others.
 */
export async function initVerdictCorpus(repos: Repos): Promise<void> {
  for (const dataset of VERDICT_DATASETS) {
    await loadDataset(repos, dataset);
  }
}

/** Test-only: reset the in-process load guards. */
export function _resetVerdictCorpusLoadGuard(): void {
  _loaded.clear();
}
