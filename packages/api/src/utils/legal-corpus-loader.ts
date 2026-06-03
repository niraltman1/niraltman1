import { existsSync, createReadStream, statSync } from 'node:fs';
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

const SIG_KEY = 'legal_corpus_artifact_sig';
const __dirname = dirname(fileURLToPath(import.meta.url));
// FACTUM_IL_ROOT is set by the installer to {app}\app; in the monorepo we resolve from
// dist/utils → api → packages → repo-root (same shape as legal-registry-loader.ts).
const REPO_ROOT = process.env['FACTUM_IL_ROOT'] ?? join(__dirname, '..', '..', '..', '..');

let _loaded = false;

/** Locate the artifact: installer dir first, then the monorepo asset dir; .gz preferred. */
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

function readStoredSignature(repos: Repos): string | null {
  try {
    const row = repos.db.prepare('SELECT value FROM SystemSettings WHERE key = ?').get(SIG_KEY) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  } catch {
    return null; // SystemSettings may not exist in a minimal/test DB — treat as "load".
  }
}

function writeStoredSignature(repos: Repos, sig: string): void {
  try {
    repos.db.prepare(`
      INSERT INTO SystemSettings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(SIG_KEY, sig);
  } catch {
    /* best-effort — a missing table just means we reload next boot */
  }
}

/**
 * Import the bundled corpus. `overridePath` (tests) bypasses path resolution and the
 * signature guard so a fixture loads deterministically.
 */
export async function initLegalCorpus(repos: Repos, overridePath?: string): Promise<void> {
  if (_loaded) return;
  _loaded = true;

  const path = overridePath ?? resolveArtifactPath();
  if (!path || !existsSync(path)) {
    logger.warn('[legal-corpus] artifact not found — run: pnpm ingest-knesset-odata', { category: 'system' });
    return;
  }

  if (!overridePath) {
    const sig = artifactSignature(path);
    if (readStoredSignature(repos) === sig) return; // unchanged since last load — skip the read
    writeStoredSignature(repos, sig);
  }

  const repo = repos.legalCorpus;
  const input = path.endsWith('.gz') ? createReadStream(path).pipe(createGunzip()) : createReadStream(path);
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
      sources += 1;
      sections += (rec.sections ?? []).length;
    } catch (e) {
      failed += 1;
      logger.warn(`[legal-corpus] skipped malformed line: ${String(e)}`, { category: 'system' });
    }
  }

  logger.info(
    `[legal-corpus] loaded ${sources} sources, ${sections} sections, ${embedded} embeddings (${failed} skipped)`,
    { category: 'system' },
  );
}

/** Test-only: reset the in-process load guard so a fresh DB can be loaded again. */
export function _resetLegalCorpusLoadGuard(): void {
  _loaded = false;
}
