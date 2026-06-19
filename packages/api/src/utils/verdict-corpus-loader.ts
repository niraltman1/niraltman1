import { existsSync, createReadStream, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { logger } from '@factum-il/shared';
import type { Repos } from '../db.js';
import type { VerdictInput } from '@factum-il/database';
import { rawGuychukRowToVerdict } from '../modules/verdict-corpus/transform.js';
import { GUYCHUK_PROVENANCE } from '../modules/verdict-corpus/ingest.js';

// SystemSettings keys
const SIG_KEY      = 'verdict_corpus_artifact_sig';
const SHA256_KEY   = 'verdict_corpus_sha256';
const VERSION_KEY  = 'verdict_corpus_version';
const PROGRESS_KEY = 'verdict_corpus_progress';

const BATCH_SIZE      = 500;
const MIN_TEXT_LENGTH = 50;

const __dirname = dirname(fileURLToPath(import.meta.url));
// FACTUM_IL_ROOT is set by the installer to {app}\app; in the monorepo we resolve
// from dist/utils → api → packages → repo-root (same shape as legal-corpus-loader.ts).
const REPO_ROOT = process.env['FACTUM_IL_ROOT'] ?? join(__dirname, '..', '..', '..', '..');

let _loaded = false;

function resolveArtifactPath(): { jsonl: string; meta: string | null } | null {
  const bases = [
    join(REPO_ROOT, 'verdict-corpus'),
    join(REPO_ROOT, 'assets', 'verdict-corpus'),
  ];
  for (const base of bases) {
    const jsonl = join(base, 'case-law-il.jsonl.gz');
    if (existsSync(jsonl)) {
      const meta = join(base, 'corpus-metadata.json');
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

function validateRow(row: Record<string, unknown>): string | null {
  if (typeof row['judgment_id'] !== 'string' || !row['judgment_id'].trim())
    return 'missing_judgment_id';
  const text = typeof row['document_text'] === 'string' ? row['document_text'].trim() : '';
  if (!text)                         return 'missing_document_text';
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
 * First-run loader for the bundled Israeli court verdicts corpus.
 *
 * Reads `verdict-corpus/case-law-il.jsonl.gz` produced by the
 * `ingest-caselawil-corpus.yml` CI workflow and imports it into
 * `VerdictCorpus` via `VerdictCorpusRepository`.
 *
 * Behaviour:
 *   - Idempotent: skips load when SHA-256 of the artifact is unchanged.
 *   - Resumable: persists the last committed line number in SystemSettings
 *     so a crash mid-load resumes from the checkpoint rather than restarting.
 *   - Graceful: if the artifact is absent (dev machine without full corpus),
 *     logs a hint and returns — never throws.
 */
export async function initVerdictCorpus(repos: Repos): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  const paths = resolveArtifactPath();
  if (!paths) {
    logger.warn(
      '[verdict-corpus] artifact not found — run: pnpm ingest-verdict-corpus',
      { category: 'system' },
    );
    return;
  }

  const { jsonl: artifactPath } = paths;

  // Quick sig check to skip unchanged artifacts before computing SHA-256
  const sig = artifactSignature(artifactPath);
  if (readSetting(repos, SIG_KEY) === sig) return;

  // SHA-256 integrity check (Enhancement 1 / Phase 5)
  const sha256 = await computeSha256(artifactPath);
  const storedSha = readSetting(repos, SHA256_KEY);
  if (storedSha && storedSha === sha256) {
    // Same content, different mtime (e.g. re-extracted) — update the sig and skip.
    writeSetting(repos, SIG_KEY, sig);
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

  // Resume support (Enhancement 2 / Phase 6): read last committed line number
  const savedProgress = readSetting(repos, PROGRESS_KEY);
  const resumeFrom    = savedProgress ? (Number(savedProgress) || 0) : 0;
  if (resumeFrom > 0) {
    logger.info(`[verdict-corpus] resuming from line ${resumeFrom}`, { category: 'system' });
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
    // Persist checkpoint so a crash mid-load can resume (Enhancement 2)
    writeSetting(repos, PROGRESS_KEY, String(telemetry.linesRead));
  };

  // Progress reporting (Enhancement 3 / Phase 7)
  logger.info('[verdict-corpus] start — loading case-law-il.jsonl.gz', {
    category: 'system', event: 'verdict-corpus:start', corpusVersion,
  });

  const input = createReadStream(artifactPath).pipe(createGunzip());
  const rl    = createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    telemetry.linesRead += 1;
    if (telemetry.linesRead <= resumeFrom) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Validation (Enhancement 4 / Phase 8)
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      telemetry.rejected += 1;
      telemetry.rejectionReasons['malformed_json'] =
        (telemetry.rejectionReasons['malformed_json'] ?? 0) + 1;
      continue;
    }

    const reason = validateRow(row);
    if (reason) {
      telemetry.rejected += 1;
      telemetry.rejectionReasons[reason] = (telemetry.rejectionReasons[reason] ?? 0) + 1;
      continue;
    }

    // Cross-dataset deduplication within this run (Enhancement 5 / Phase 9)
    const docKey = `guychuk:${String(row['judgment_id']).trim()}`;
    if (seenKeys.has(docKey)) {
      telemetry.rejected += 1;
      telemetry.rejectionReasons['duplicate_id'] =
        (telemetry.rejectionReasons['duplicate_id'] ?? 0) + 1;
      continue;
    }
    seenKeys.add(docKey);

    const input = rawGuychukRowToVerdict(row, GUYCHUK_PROVENANCE);
    if (!input) { telemetry.skipped += 1; continue; }

    batch.push(input);
    if (batch.length >= BATCH_SIZE) flushBatch();

    // Periodic progress log every 2 000 rows (Enhancement 3)
    if (telemetry.linesRead % 2_000 === 0) {
      logger.info('[verdict-corpus] progress', {
        category: 'system', event: 'verdict-corpus:progress',
        processed: telemetry.ingested, linesRead: telemetry.linesRead,
      });
    }
  }

  flushBatch(); // flush any remaining partial batch

  // Persist corpus version metadata and clear the in-progress checkpoint
  writeSetting(repos, SIG_KEY, sig);
  writeSetting(repos, SHA256_KEY, sha256);
  writeSetting(repos, VERSION_KEY, corpusVersion);
  writeSetting(repos, PROGRESS_KEY, ''); // cleared — load complete

  telemetry.elapsedMs = Date.now() - startMs;

  // Structured completion telemetry (Enhancement 13 / Phase 21)
  logger.info(
    `[verdict-corpus] loaded ${telemetry.ingested} rulings, ${telemetry.skipped} skipped, ` +
    `${telemetry.rejected} rejected (${telemetry.batchesCompleted} batches) — ` +
    `${telemetry.elapsedMs}ms`,
    {
      category: 'system',
      event: 'verdict-corpus:completed',
      corpusVersion,
      sha256,
      ...telemetry,
    },
  );
}

/** Test-only: reset the in-process load guard. */
export function _resetVerdictCorpusLoadGuard(): void {
  _loaded = false;
}
