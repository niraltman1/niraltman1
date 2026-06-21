#!/usr/bin/env tsx
/**
 * Consolidate per-shard legal-brain databases (one per matrix job in the
 * legal-brain-ingestion workflow) into a single master SQLite database.
 *
 * Each shard DB holds a disjoint slice of LegalDocuments + LegalDocumentChunks
 * (statutes by domain, verdicts by court category). Shards are built
 * independently, so their FDOC document ids and chunk rowids are NOT globally
 * unique — every shard starts its own sequence at FDOC-00000001. The merge
 * therefore RE-KEYS each shard's documents to a fresh master FDOC id and rewrites
 * its chunks to point at the new id, then rebuilds `vec_legal_chunks` from the
 * JSON embeddings (mirrors migration 088's backfill), avoiding fragile
 * cross-database copies of the vec0 virtual table.
 *
 * Idempotent across shards by `external_id` (a document already present in the
 * master — same statute sourceKey / verdict docKey — is skipped with its chunks).
 *
 * Usage:
 *   tsx scripts/merge-corpus-dbs.ts --out <master.db> <shard1.db> <shard2.db> …
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, MigrationRunner } from '@factum-il/database';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Args { out: string; shards: string[] }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { out: join(__dirname, '..', '_data', 'factum-il.db'), shards: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--out' && a[i + 1]) out.out = a[++i]!;
    else out.shards.push(a[i]!);
  }
  if (out.shards.length === 0) { console.error('ERROR: provide at least one shard DB path'); process.exit(2); }
  return out;
}

function count(db: DatabaseConnection, table: string): number {
  try { return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n; }
  catch { return 0; }
}

interface DocRow {
  document_id: string; source_id: number; source_type: string; source_dataset: string;
  source_version: string | null; document_type: string; proceeding_type: string | null;
  court: string | null; case_number: string | null; title: string | null; date: string | null;
  year: number | null; judges_json: string; parties_json: string; lawyers_json: string;
  text: string; char_count: number; metadata_json: string; visibility_scope: string;
  canonical_case_key: string | null; external_id: string | null; content_hash: string | null;
  is_active: number;
}
interface ChunkRow {
  document_id: string; chunk_index: number; chunk_text: string;
  char_count: number; embedding: string | null;
}

function main(): void {
  const args = parseArgs();
  const master = new DatabaseConnection({ path: args.out });
  new MigrationRunner(master, join(__dirname, '..', 'migrations')).run();

  const existsExternal = master.prepare('SELECT 1 FROM LegalDocuments WHERE external_id = ? LIMIT 1');
  const nextSeq        = master.prepare('INSERT INTO LegalDocumentIdSeq DEFAULT VALUES');
  const insertDoc      = master.prepare(`
    INSERT INTO LegalDocuments (
      document_id, source_id, source_type, source_dataset, source_version,
      document_type, proceeding_type, court, case_number, title, date, year,
      judges_json, parties_json, lawyers_json, text, char_count,
      metadata_json, visibility_scope, canonical_case_key,
      external_id, content_hash, is_active
    ) VALUES (
      @document_id, @source_id, @source_type, @source_dataset, @source_version,
      @document_type, @proceeding_type, @court, @case_number, @title, @date, @year,
      @judges_json, @parties_json, @lawyers_json, @text, @char_count,
      @metadata_json, @visibility_scope, @canonical_case_key,
      @external_id, @content_hash, @is_active
    )
  `);
  const insertChunk = master.prepare(`
    INSERT OR IGNORE INTO LegalDocumentChunks (document_id, chunk_index, chunk_text, char_count, embedding)
    VALUES (@document_id, @chunk_index, @chunk_text, @char_count, @embedding)
  `);

  function freshDocId(): string {
    const seq = nextSeq.run().lastInsertRowid as number;
    return `FDOC-${String(seq).padStart(8, '0')}`;
  }

  for (const shard of args.shards) {
    const safe = shard.replace(/'/g, "''");
    master.exec(`ATTACH DATABASE '${safe}' AS shard`);
    let docs = 0, chunks = 0;
    try {
      master.transaction(() => {
        const idMap = new Map<string, string>(); // shard FDOC → master FDOC
        const docRows = master.prepare('SELECT * FROM shard.LegalDocuments').all() as DocRow[];
        for (const r of docRows) {
          if (r.external_id && existsExternal.get(r.external_id)) continue; // dedup across shards
          const newId = freshDocId();
          idMap.set(r.document_id, newId);
          insertDoc.run({ ...r, document_id: newId });
          docs++;
        }
        const chunkRows = master.prepare('SELECT * FROM shard.LegalDocumentChunks').all() as ChunkRow[];
        for (const c of chunkRows) {
          const newDocId = idMap.get(c.document_id);
          if (!newDocId) continue; // its document was a cross-shard duplicate — skip
          insertChunk.run({ ...c, document_id: newDocId });
          chunks++;
        }
      });
      console.log(`  merged ${shard}: +${docs} docs, +${chunks} chunks`);
    } finally {
      master.exec('DETACH DATABASE shard');
    }
  }

  // Rebuild vec_legal_chunks from the JSON embeddings now present in the master
  // (rowid == LegalDocumentChunks.id, matching migration 088). Skipped silently
  // when sqlite-vec is unavailable — FTS still works.
  let vecRebuilt = 0;
  try {
    master.exec('DELETE FROM vec_legal_chunks');
    master.exec(`
      INSERT OR REPLACE INTO vec_legal_chunks(rowid, embedding)
      SELECT id, vec_f32(embedding) FROM LegalDocumentChunks WHERE embedding IS NOT NULL
    `);
    vecRebuilt = count(master, 'vec_legal_chunks');
  } catch {
    console.log('  (vec_legal_chunks unavailable — sqlite-vec not loaded; FTS-only master)');
  }

  console.log(`✅ Master: ${count(master, 'LegalDocuments')} documents, ${count(master, 'LegalDocumentChunks')} chunks, ${vecRebuilt} vectors → ${args.out}`);
  master.close();
}

main();
