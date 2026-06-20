/**
 * verdict-corpus-loader.test.ts — first-run loader for the bundled verdict corpora.
 *
 * Verifies the loader imports BOTH bundled datasets (guychuk full-hierarchy +
 * LevMuchnik Supreme Court) from their gzip artifacts, is graceful when a dataset
 * file is absent, and is idempotent across runs (SHA-256 skip).
 *
 * The loader reads FACTUM_IL_ROOT\verdict-corpus\<file>.jsonl.gz, so each test
 * points FACTUM_IL_ROOT at a fresh temp dir and re-imports the module (its
 * REPO_ROOT is resolved once at module load).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { DatabaseConnection } from '@factum-il/database';
import type { VerdictInput } from '@factum-il/database';
import type { Repos } from '../db.js';

type Loader = typeof import('../utils/verdict-corpus-loader.js');

const HE_TEXT = 'פסק דין לדוגמה — '.repeat(6); // comfortably over MIN_TEXT_LENGTH (50)

function gzLine(...objs: Record<string, unknown>[]): Buffer {
  return gzipSync(Buffer.from(objs.map((o) => JSON.stringify(o)).join('\n'), 'utf-8'));
}

describe('initVerdictCorpus — bundled verdict corpora loader', () => {
  let root: string;
  let vcDir: string;
  let db: DatabaseConnection;
  let collected: VerdictInput[];
  let repos: Repos;
  let loader: Loader;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'fil-verdict-'));
    vcDir = join(root, 'verdict-corpus');
    mkdirSync(vcDir, { recursive: true });

    db = new DatabaseConnection({ path: ':memory:' });
    db.exec('CREATE TABLE SystemSettings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);');

    collected = [];
    repos = {
      db,
      verdictCorpus: { bulkUpsert: (rows: VerdictInput[]) => { collected.push(...rows); } },
    } as unknown as Repos;

    // REPO_ROOT is read at module-eval time → set env then import a fresh copy.
    vi.resetModules();
    process.env['FACTUM_IL_ROOT'] = root;
    loader = await import('../utils/verdict-corpus-loader.js');
    loader._resetVerdictCorpusLoadGuard();
  });

  afterEach(() => {
    delete process.env['FACTUM_IL_ROOT'];
    rmSync(root, { recursive: true, force: true });
  });

  it('loads BOTH guychuk and Supreme Court datasets into the same table', async () => {
    writeFileSync(join(vcDir, 'case-law-il.jsonl.gz'),
      gzLine({ judgment_id: 'j1', document_text: HE_TEXT }));
    writeFileSync(join(vcDir, 'supreme-court-il.jsonl.gz'),
      gzLine({ document_hash: 'h1', text: HE_TEXT, Year: 2022 }));

    await loader.initVerdictCorpus(repos);

    const keys = collected.map((v) => v.docKey).sort();
    expect(keys).toEqual(['guychuk:j1', 'h1']);
    // each dataset persisted its own idempotency marker under a distinct key prefix
    const settings = (db.prepare('SELECT key FROM SystemSettings').all() as { key: string }[])
      .map((r) => r.key);
    expect(settings).toContain('verdict_corpus_sha256');
    expect(settings).toContain('supreme_court_corpus_sha256');
  });

  it('is graceful when the Supreme Court artifact is absent (guychuk still loads)', async () => {
    writeFileSync(join(vcDir, 'case-law-il.jsonl.gz'),
      gzLine({ judgment_id: 'j1', document_text: HE_TEXT }));

    await expect(loader.initVerdictCorpus(repos)).resolves.toBeUndefined();
    expect(collected.map((v) => v.docKey)).toEqual(['guychuk:j1']);
  });

  it('is idempotent across runs — unchanged artifacts are skipped (no re-import)', async () => {
    writeFileSync(join(vcDir, 'case-law-il.jsonl.gz'),
      gzLine({ judgment_id: 'j1', document_text: HE_TEXT }));
    writeFileSync(join(vcDir, 'supreme-court-il.jsonl.gz'),
      gzLine({ document_hash: 'h1', text: HE_TEXT }));

    await loader.initVerdictCorpus(repos);
    expect(collected).toHaveLength(2);

    loader._resetVerdictCorpusLoadGuard(); // clear in-process guard; SHA-256 must still skip
    await loader.initVerdictCorpus(repos);
    expect(collected).toHaveLength(2); // nothing re-imported
  });

  it('rejects rows whose text is too short and skips untransformable rows', async () => {
    writeFileSync(join(vcDir, 'case-law-il.jsonl.gz'),
      gzLine(
        { judgment_id: 'ok', document_text: HE_TEXT }, // valid
        { judgment_id: 'short', document_text: 'קצר' }, // too short → rejected
        { document_text: HE_TEXT },                     // missing id → rejected
      ));

    await loader.initVerdictCorpus(repos);
    expect(collected.map((v) => v.docKey)).toEqual(['guychuk:ok']);
  });
});
