#!/usr/bin/env tsx
/**
 * Build a chunk-level legal-brain database from a downloaded corpus JSONL(.gz)
 * file — the consumer half of the `legal-brain-ingestion` workflow.
 *
 * Unlike the runtime loaders (which fill LegalSources / VerdictCorpus), this maps
 * each input row into the UNIFIED `LegalDocuments` model, runs the differential
 * chunker (`@factum-il/retrieval` chunkDocument, statute vs verdict profile), and
 * embeds every chunk into `LegalDocumentChunks` + `vec_legal_chunks` (migration
 * 088). With `--mock` it uses the deterministic offline embedder so the whole
 * pipeline runs in CI without Ollama.
 *
 * Inputs it understands (auto-detected per row):
 *   • statute  → ArtifactRecord (schemaVersion:1, israelLawId, sections[])
 *                from assets/legal-corpus batch-*.jsonl.gz
 *   • verdict  → guychuk/case-law-israel rows (judgment_id, document_text)
 *                or LevMuchnik/SupremeCourtOfIsrael rows (document_hash, text)
 *
 * Usage:
 *   tsx scripts/ingest-corpus-chunks.ts --input <file.jsonl[.gz]> --type statute|verdict
 *        [--db <path>] [--domain <name>] [--court <cat>] [--mock] [--limit <n>]
 *
 *   --type    statute | verdict (selects chunk profile + schema mapping)
 *   --domain  Tag stored on each statute doc's metadata (matrix shard label)
 *   --court   Keep only verdicts of this court category. One of:
 *             supreme | district | magistrate | family | labor | traffic | other
 *   --mock    Use deterministic offline embeddings (no Ollama). Default: Ollama.
 *   --limit   Stop after N successfully ingested documents (debug / smoke test).
 */

import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DatabaseConnection,
  MigrationRunner,
  LegalDocumentRepository,
  LegalDocumentChunkEmbeddingRepository,
  type LegalDocumentInput,
} from '@factum-il/database';
import { chunkDocument, embed, mockEmbed, type DocType } from '@factum-il/retrieval';
import { rawGuychukRowToVerdict, rawRowToVerdict } from '../packages/api/src/modules/verdict-corpus/transform.js';
import { SUPREME_COURT_PROVENANCE, GUYCHUK_PROVENANCE } from '../packages/api/src/modules/verdict-corpus/ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

type CorpusType = 'statute' | 'verdict';

interface Args {
  input:  string;
  type:   CorpusType;
  dbPath: string;
  domain: string | null;
  court:  string | null;
  mock:   boolean;
  limit:  number;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = {
    input:  '',
    type:   'verdict',
    dbPath: join(__dirname, '..', '_data', 'factum-il.db'),
    domain: null,
    court:  null,
    mock:   false,
    limit:  Number.POSITIVE_INFINITY,
  };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--input'  && a[i + 1]) out.input  = a[++i]!;
    else if (a[i] === '--type'   && a[i + 1]) out.type   = a[++i] as CorpusType;
    else if (a[i] === '--db'     && a[i + 1]) out.dbPath = a[++i]!;
    else if (a[i] === '--domain' && a[i + 1]) out.domain = a[++i]!;
    else if (a[i] === '--court'  && a[i + 1]) out.court  = a[++i]!.toLowerCase();
    else if (a[i] === '--mock')               out.mock   = true;
    else if (a[i] === '--limit'  && a[i + 1]) out.limit  = Number(a[++i]);
  }
  if (!out.input)  { console.error('ERROR: --input <file.jsonl[.gz]> is required'); process.exit(2); }
  if (out.type !== 'statute' && out.type !== 'verdict') {
    console.error("ERROR: --type must be 'statute' or 'verdict'"); process.exit(2);
  }
  return out;
}

// ── Embedding ────────────────────────────────────────────────────────────────
const EMBED_CHARS = 2_000; // bound per-chunk text (parity with nomic-embed-text path)

function makeEmbedder(mock: boolean): (text: string) => Promise<number[] | null> {
  if (mock) return (text) => Promise.resolve(mockEmbed(text.slice(0, EMBED_CHARS)));
  return (text) => embed(text.slice(0, EMBED_CHARS));
}

// ── Court-category filter (verdict matrix sharding) ──────────────────────────
const COURT_MATCHERS: Record<string, (court: string | null) => boolean> = {
  supreme:    (c) => !!c && c.includes('עליון'),
  district:   (c) => !!c && c.includes('מחוזי'),
  magistrate: (c) => !!c && c.includes('שלום'),
  family:     (c) => !!c && c.includes('משפחה'),
  labor:      (c) => !!c && c.includes('עבודה'),
  traffic:    (c) => !!c && c.includes('תעבורה'),
};
function matchesCourt(category: string, court: string | null): boolean {
  const known = COURT_MATCHERS[category];
  if (known) return known(court);
  // 'other' (or any unknown category) = everything not claimed by a known court.
  return !Object.values(COURT_MATCHERS).some((m) => m(court));
}

// ── Schema mapping → LegalDocumentInput ──────────────────────────────────────

interface SectionRec { sectionLabel: string; headingHe?: string | null; verbatimText: string; orderIndex: number }

/** Resolve a LegalSourceRegistry row id by its string source_id (FK target). */
function resolveSourceId(db: DatabaseConnection, sourceKey: string): number {
  const row = db.prepare('SELECT id FROM LegalSourceRegistry WHERE source_id = ?').get(sourceKey) as { id: number } | undefined;
  if (!row) {
    throw new Error(`LegalSourceRegistry has no source '${sourceKey}' (migration 082 seeds it).`);
  }
  return row.id;
}

function statuteToInput(row: Record<string, unknown>, sourceId: number, domain: string | null): LegalDocumentInput | null {
  const israelLawId = row['israelLawId'];
  const sections = Array.isArray(row['sections']) ? (row['sections'] as SectionRec[]) : [];
  if (sections.length === 0) return null;

  const text = [...sections]
    .sort((x, y) => x.orderIndex - y.orderIndex)
    .map((s) => `${s.sectionLabel}${s.headingHe ? ' ' + s.headingHe : ''}\n${s.verbatimText}`)
    .join('\n\n')
    .trim();
  if (text.length <= 20) return null;

  const sourceKey = typeof row['sourceKey'] === 'string' ? row['sourceKey'] : `il_law_${String(israelLawId)}`;
  return {
    sourceId,
    sourceType:    'LEGISLATION',
    sourceDataset: 'factum-il/legislation',
    documentType:  'STATUTE',
    title:         typeof row['titleHe'] === 'string' ? row['titleHe'] : null,
    year:          typeof row['year'] === 'number' ? row['year'] : null,
    text,
    externalId:    sourceKey,
    metadata: {
      israelLawId:     israelLawId ?? null,
      sourceKey,
      procedureDomain: row['procedureDomain'] ?? null,
      shardDomain:     domain,
    },
    visibilityScope: 'PUBLIC',
  };
}

function verdictToInput(row: Record<string, unknown>): { input: LegalDocumentInput; court: string | null } | null {
  // Auto-detect dataset by signature: guychuk has judgment_id; LevMuchnik has document_hash.
  const isGuychuk = 'judgment_id' in row;
  const verdict = isGuychuk
    ? rawGuychukRowToVerdict(row, GUYCHUK_PROVENANCE)
    : rawRowToVerdict(row, SUPREME_COURT_PROVENANCE);
  if (!verdict) return null;

  const court = verdict.court ?? null;
  const input: LegalDocumentInput = {
    sourceId:      0, // filled by caller (depends on dataset)
    sourceType:    'CASE_LAW',
    sourceDataset: verdict.sourceDataset,
    documentType:  'VERDICT',
    court,
    caseNumber:    verdict.caseNumber ?? null,
    title:         verdict.caseName ?? null,
    date:          verdict.verdictDate ?? null,
    year:          verdict.year ?? null,
    judges:        verdict.judges ?? [],
    parties:       verdict.parties ?? [],
    lawyers:       verdict.lawyers ?? [],
    text:          verdict.verbatimText,
    externalId:    verdict.docKey,
    metadata:      { snapshotLabel: verdict.snapshotLabel ?? null, sourceLicense: verdict.sourceLicense ?? null },
    visibilityScope: 'PUBLIC',
  };
  return { input, court };
}

// ── Line reader (transparent gzip) ───────────────────────────────────────────
async function* readLines(path: string): AsyncGenerator<string> {
  const raw = createReadStream(path);
  const stream = path.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t !== '') yield t;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const db   = new DatabaseConnection({ path: args.dbPath });
  new MigrationRunner(db, join(__dirname, '..', 'migrations')).run();

  const docs      = new LegalDocumentRepository(db);
  const chunkRepo = new LegalDocumentChunkEmbeddingRepository(db);
  const embedText = makeEmbedder(args.mock);

  const profile: DocType = args.type === 'statute' ? 'statute' : 'verdict';
  const statuteSourceId  = args.type === 'statute' ? resolveSourceId(db, 'factum-il/legislation') : 0;
  const guychukSourceId  = resolveSourceId(db, 'guychuk/case-law-israel');
  const levSourceId      = resolveSourceId(db, 'LevMuchnik/SupremeCourtOfIsrael');

  const existsStmt   = db.prepare('SELECT 1 FROM LegalDocuments WHERE external_id = ? LIMIT 1');
  const insertChunk  = db.prepare(`
    INSERT INTO LegalDocumentChunks (document_id, chunk_index, chunk_text, char_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(document_id, chunk_index) DO NOTHING
  `);
  const getChunkId   = db.prepare('SELECT id FROM LegalDocumentChunks WHERE document_id = ? AND chunk_index = ?');

  console.log(`Ingesting ${args.type} corpus → ${args.dbPath}`);
  console.log(`  input: ${args.input}${args.court ? `  court=${args.court}` : ''}${args.domain ? `  domain=${args.domain}` : ''}  mock=${args.mock}  vec=${chunkRepo.isVecAvailable()}`);

  let read = 0, docsDone = 0, chunksEmbedded = 0, skipped = 0, failed = 0;
  const startMs = Date.now();
  // chunkDocument expects a numeric documentId for its Chunk records; the persisted
  // rows key off the FDOC string, so this counter is only a transient handle.
  let chunkSeq = 0;

  for await (const line of readLines(args.input)) {
    if (docsDone >= args.limit) break;
    read++;
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; }
    catch { failed++; continue; }

    // Map → LegalDocumentInput (+ court for verdict filtering / source resolution).
    let input: LegalDocumentInput | null;
    if (args.type === 'statute') {
      input = statuteToInput(row, statuteSourceId, args.domain);
    } else {
      const mapped = verdictToInput(row);
      if (!mapped) { skipped++; continue; }
      if (args.court && !matchesCourt(args.court, mapped.court)) { skipped++; continue; }
      input = mapped.input;
      input.sourceId = input.sourceDataset === GUYCHUK_PROVENANCE.sourceDataset ? guychukSourceId : levSourceId;
    }
    if (!input) { skipped++; continue; }

    // Idempotent: a document already ingested (by external id) is left untouched.
    if (input.externalId && existsStmt.get(input.externalId)) { skipped++; continue; }

    const documentId = docs.insert(input);

    const chunks = chunkDocument(input.text, ++chunkSeq, profile);
    if (chunks.length === 0) { docsDone++; continue; }

    db.transaction(() => {
      for (const c of chunks) insertChunk.run(documentId, c.chunkIndex, c.text, c.text.length);
    });

    for (const c of chunks) {
      const cr = getChunkId.get(documentId, c.chunkIndex) as { id: number } | undefined;
      if (!cr) continue;
      const vec = await embedText(c.text);
      if (vec) { chunkRepo.upsert({ chunkId: cr.id, embedding: vec }); chunksEmbedded++; }
      else failed++;
    }

    docsDone++;
    if (docsDone % 100 === 0) {
      const elapsed = Math.round((Date.now() - startMs) / 1000);
      process.stdout.write(`\r  read ${read}, docs ${docsDone}, chunks ${chunksEmbedded}, skipped ${skipped} — ${elapsed}s`);
    }
  }

  process.stdout.write('\n');
  console.log(`✅ Done: ${docsDone} docs, ${chunksEmbedded} chunk embeddings, ${skipped} skipped, ${failed} failed — ${Math.round((Date.now() - startMs) / 1000)}s`);
  console.log(`   Chunk embeddings in DB: ${chunkRepo.count()}`);
  db.close();
}

main().catch((err) => {
  console.error('❌ Corpus chunk ingestion failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
