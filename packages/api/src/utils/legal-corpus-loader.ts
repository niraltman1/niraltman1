import { existsSync, createReadStream, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { logger } from '@factum-il/shared';
import type { Repos } from '../db.js';
import type { LegalSectionInput, LegalSourceType } from '@factum-il/database';

/**
 * First-run loader for the bundled, offline legislation corpus.
 *
 * Reads the static JSONL(.gz) artifact produced by `scripts/ingest-knesset-odata.ts` and
 * imports it into the migration-061 tables via `LegalCorpusRepository`. Mirrors
 * `legal-registry-loader.ts`: zero network I/O, idempotent, and graceful when the artifact
 * is absent (logs a hint and returns — never throws, per CLAUDE.md §"fail gracefully").
 *
 * Reload policy: loads on first boot, and again whenever a NEW artifact ships (its size+mtime
 * signature changes — i.e. after an app update). When the signature is unchanged it skips the
 * file read entirely, so steady-state boots pay nothing.
 */

// Structurally-compatible reader for the one-law-per-line records written by artifact.ts.
interface ArtifactRecord {
  sourceKey:        string;
  titleHe:          string;
  shortName?:       string | null;
  citation?:        string | null;
  sourceType:       LegalSourceType;
  procedureDomain?: string | null;
  sourceUrl?:       string | null;
  year?:            number | null;
  sections:         LegalSectionInput[];
  embeddings?:      { orderIndex: number; model: string; vector: number[] }[];
}

const SIG_KEY       = 'legal_corpus_artifact_sig';
const BATCH_SIG_KEY = 'legal_corpus_batch_dir_sig';
const __dirname = dirname(fileURLToPath(import.meta.url));
// FACTUM_IL_ROOT is set by the installer to {app}\app; in the monorepo we resolve from
// dist/utils → api → packages → repo-root (same shape as legal-registry-loader.ts).
const REPO_ROOT = process.env['FACTUM_IL_ROOT'] ?? join(__dirname, '..', '..', '..', '..');

let _loaded = false;

/** Locate the batch directory: installer dir first, then the monorepo asset dir. */
function resolveBatchDir(): string | null {
  const candidates = [
    join(REPO_ROOT, 'legal-corpus', 'batches'),
    join(REPO_ROOT, 'assets', 'legal-corpus', 'batches'),
  ];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter((f) => /^batch-[a-z0-9_]+\.jsonl\.gz$/.test(f));
      if (files.length > 0) return dir;
    } catch { /* skip unreadable dirs */ }
  }
  return null;
}

/** Locate the monolithic artifact: installer dir first, then the monorepo asset dir; .gz preferred. */
function resolveArtifactPath(): string | null {
  const candidates = [
    join(REPO_ROOT, 'legal-corpus', 'legal-corpus.knesset.jsonl.gz'),
    join(REPO_ROOT, 'legal-corpus', 'legal-corpus.knesset.jsonl'),
    join(REPO_ROOT, 'assets', 'legal-corpus', 'legal-corpus.knesset.jsonl.gz'),
    join(REPO_ROOT, 'assets', 'legal-corpus', 'legal-corpus.knesset.jsonl'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function artifactSignature(path: string): string {
  const st = statSync(path);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

/** Signature for a batch directory: dir path + name:size for every batch file. */
function batchDirSignature(dir: string): string {
  const files = readdirSync(dir)
    .filter((f) => /^batch-[a-z0-9_]+\.jsonl\.gz$/.test(f))
    .sort();
  const parts = files.map((f) => {
    const st = statSync(join(dir, f));
    return `${f}:${st.size}`;
  });
  return `${dir}|${parts.join('|')}`;
}

function readStoredSignature(repos: Repos, key: string): string | null {
  try {
    const row = repos.db.prepare('SELECT value FROM SystemSettings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeStoredSignature(repos: Repos, key: string, sig: string): void {
  try {
    repos.db.prepare(`
      INSERT INTO SystemSettings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(key, sig);
  } catch {
    /* best-effort — a missing table just means we reload next boot */
  }
}

/** Stream one JSONL(.gz) file into the corpus repository. Returns [sources, sections, embedded, failed]. */
async function loadOneFile(filePath: string, repos: Repos): Promise<[number, number, number, number]> {
  const repo = repos.legalCorpus;
  const input = filePath.endsWith('.gz')
    ? createReadStream(filePath).pipe(createGunzip())
    : createReadStream(filePath);
  const rl = createInterface({ input, crlfDelay: Infinity });

  let sources = 0, sections = 0, embedded = 0, failed = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as ArtifactRecord;
      const sourceId = repo.upsertSource({
        sourceKey:       rec.sourceKey,
        titleHe:         rec.titleHe,
        shortName:       rec.shortName ?? null,
        citation:        rec.citation ?? null,
        sourceType:      rec.sourceType,
        procedureDomain: rec.procedureDomain ?? null,
        sourceUrl:       rec.sourceUrl ?? null,
        year:            rec.year ?? null,
      });
      repo.replaceSections(sourceId, rec.sections ?? []);
      if (rec.embeddings && rec.embeddings.length > 0) {
        const byOrder = new Map(repo.getSections(sourceId).map((s) => [s.orderIndex, s]));
        for (const emb of rec.embeddings) {
          const sec = byOrder.get(emb.orderIndex);
          if (sec) { repo.upsertEmbedding(sec.id, sourceId, emb.vector, emb.model); embedded += 1; }
        }
      }
      sources  += 1;
      sections += (rec.sections ?? []).length;
    } catch (e) {
      failed += 1;
      logger.warn(`[legal-corpus] skipped malformed line: ${String(e)}`, { category: 'system' });
    }
  }
  return [sources, sections, embedded, failed];
}

/**
 * Import the bundled corpus. `overridePath` (tests) bypasses path resolution and the
 * signature guard so a fixture loads deterministically.
 *
 * Resolution order:
 *   1. `overridePath` — used by tests or callers that already resolved the path
 *   2. Batch directory (`batches/batch-NNNN.jsonl.gz`) — preferred when present
 *   3. Monolithic single-file artifact (legacy / backward compat)
 */
export async function initLegalCorpus(repos: Repos, overridePath?: string): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  // ── Tests / explicit override: load a single file, no sig guard ─────────────────────────
  if (overridePath !== undefined) {
    if (!existsSync(overridePath)) {
      logger.warn('[legal-corpus] artifact not found — run: pnpm ingest-knesset-odata', { category: 'system' });
      return;
    }
    const [sources, sections, embedded, failed] = await loadOneFile(overridePath, repos);
    logger.info(
      `[legal-corpus] loaded ${sources} sources, ${sections} sections, ${embedded} embeddings (${failed} skipped)`,
      { category: 'system' },
    );
    return;
  }

  // ── Batch directory: preferred when present ──────────────────────────────────────────────
  const batchDir = resolveBatchDir();
  if (batchDir) {
    const sig = batchDirSignature(batchDir);
    if (readStoredSignature(repos, BATCH_SIG_KEY) === sig) return;
    writeStoredSignature(repos, BATCH_SIG_KEY, sig);

    const files = readdirSync(batchDir)
      .filter((f) => /^batch-[a-z0-9_]+\.jsonl\.gz$/.test(f))
      .sort();

    let totalSources = 0, totalSections = 0, totalEmbedded = 0, totalFailed = 0;
    for (const file of files) {
      const [s, sec, emb, fail] = await loadOneFile(join(batchDir, file), repos);
      totalSources  += s;
      totalSections += sec;
      totalEmbedded += emb;
      totalFailed   += fail;
    }
    logger.info(
      `[legal-corpus] loaded ${files.length} batches: ${totalSources} sources, ` +
      `${totalSections} sections, ${totalEmbedded} embeddings (${totalFailed} skipped)`,
      { category: 'system' },
    );
    return;
  }

  // ── Monolithic single-file fallback ─────────────────────────────────────────────────────
  const path = resolveArtifactPath();
  if (!path || !existsSync(path)) {
    logger.warn('[legal-corpus] artifact not found — run: pnpm ingest-knesset-odata', { category: 'system' });
    return;
  }

  const sig = artifactSignature(path);
  if (readStoredSignature(repos, SIG_KEY) === sig) return;
  writeStoredSignature(repos, SIG_KEY, sig);

  const [sources, sections, embedded, failed] = await loadOneFile(path, repos);
  logger.info(
    `[legal-corpus] loaded ${sources} sources, ${sections} sections, ${embedded} embeddings (${failed} skipped)`,
    { category: 'system' },
  );
}

/** Test-only: reset the in-process load guard so a fresh DB can be loaded again. */
export function _resetLegalCorpusLoadGuard(): void {
  _loaded = false;
}
