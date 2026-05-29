#!/usr/bin/env tsx
/**
 * Backfill vec_chunks virtual table from existing ChunkEmbeddings rows.
 *
 * Usage:
 *   tsx scripts/backfill-vec-chunks.ts [--dry-run] [--db path/to/factum-il.db]
 *
 * Requires sqlite-vec extension. If the extension is not loaded, the script
 * exits cleanly with a warning — it never crashes the process.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BATCH_SIZE = 100;

function parseArgs(): { dbPath: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let dbPath = join(__dirname, '..', 'data', 'factum-il.db');
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--db' && args[i + 1]) {
      dbPath = args[++i]!;
    }
  }

  return { dbPath, dryRun };
}

function run(): void {
  const { dbPath, dryRun } = parseArgs();

  if (!existsSync(dbPath)) {
    console.error(`[backfill] Database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: dryRun });

  // Verify sqlite-vec is available
  try {
    db.exec('SELECT vec_version()');
  } catch {
    console.warn('[backfill] sqlite-vec extension not available — skipping backfill');
    db.close();
    return;
  }

  // Verify vec_chunks table exists
  const tableExists = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='vec_chunks'`,
  ).get();
  if (!tableExists) {
    console.warn('[backfill] vec_chunks table not found — run migrations first');
    db.close();
    return;
  }

  const { count } = db.prepare<[], { count: number }>(`
    SELECT COUNT(*) AS count
    FROM   ChunkEmbeddings ce
    WHERE  ce.embedding IS NOT NULL
      AND  NOT EXISTS (
        SELECT 1 FROM vec_chunks vc WHERE vc.rowid = ce.chunk_id
      )
  `).get()!;

  console.log(`[backfill] ${count} ChunkEmbeddings row(s) not yet in vec_chunks`);

  if (dryRun) {
    console.log('[backfill] Dry run — no changes written');
    db.close();
    return;
  }

  if (count === 0) {
    console.log('[backfill] Nothing to do');
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO vec_chunks(rowid, embedding)
    SELECT ce.chunk_id, vec_f32(ce.embedding)
    FROM   ChunkEmbeddings ce
    WHERE  ce.embedding IS NOT NULL
      AND  NOT EXISTS (
        SELECT 1 FROM vec_chunks vc WHERE vc.rowid = ce.chunk_id
      )
    LIMIT ${BATCH_SIZE}
  `);

  let total = 0;
  while (true) {
    const result = insert.run();
    total += result.changes;
    const pct = count > 0 ? Math.round((total / count) * 100) : 100;
    process.stdout.write(`\r[backfill] ${total}/${count} (${pct}%)`);
    if (result.changes < BATCH_SIZE) break;
  }
  process.stdout.write('\n');

  console.log(`[backfill] Done — inserted ${total} row(s) into vec_chunks`);
  db.close();
}

run();
