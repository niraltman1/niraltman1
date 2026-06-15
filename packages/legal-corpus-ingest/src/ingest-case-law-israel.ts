/**
 * ingest-case-law-israel.ts — Phases 1-12
 *
 * Ingests guychuk/case-law-israel into the unified LegalDocuments canonical model.
 * Supports: crash recovery (Phase 6), structured progress events (Phase 7),
 * dataset validation (Phase 8), cross-dataset dedup (Phase 9),
 * citation extraction (Phase 12), corpus versioning (Phase 5),
 * operational telemetry (Phase 21), benchmarking (Phase 22).
 *
 * Usage:
 *   pnpm tsx packages/legal-corpus-ingest/src/ingest-case-law-israel.ts \
 *     --input=/path/to/file.jsonl [--batch-size=100] [--max=10000] \
 *     [--extract-citations] [--resume]
 */

import { join, dirname } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  DatabaseConnection,
  MigrationRunner,
  LegalDocumentRepository,
  LegalSourceRegistryRepository,
  VerdictCitationRepository,
  LegalIngestionProgressRepository,
  LegalDocumentEmbeddingRepository,
} from '@factum-il/database';
import { CaseLawIsraelAdapter } from './case-law-israel-adapter.js';
import type { VerdictCitationInput } from '@factum-il/database';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const DB_PATH      = process.env['FACTUM_IL_DB_PATH']
  ?? join(__dirname, '..', '..', '..', '_data', 'factum-il.db');
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');
const SOURCE_ID    = 'guychuk/case-law-israel';
const BATCH_SIZE   = parseInt(process.argv.find(a => a.startsWith('--batch-size='))?.split('=')[1] ?? '100', 10);
const MAX_DOCS     = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] ?? '0', 10) || undefined;
const INPUT_FILE   = process.argv.find(a => a.startsWith('--input='))?.split('=').slice(1).join('=') ?? '';
const EXTRACT_CITE = process.argv.includes('--extract-citations');
const RESUME       = process.argv.includes('--resume');

if (!INPUT_FILE) {
  process.stderr.write('Usage: ingest-case-law-israel.ts --input=/path/to/file.jsonl [--batch-size=100] [--max=N] [--extract-citations] [--resume]\n');
  process.exit(1);
}

// ── Citation extraction ────────────────────────────────────────────────────

const CITATION_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'BGTZ',   re: /בג["״]ץ\s*\d{1,5}[/]\d{2,4}/g },
  { type: 'CA',     re: /ע["״]א\s*\d{1,5}[/]\d{2,4}/g },
  { type: 'RCA',    re: /רע["״]א\s*\d{1,5}[/]\d{2,4}/g },
  { type: 'CRIM',   re: /ע["״]פ\s*\d{1,5}[/]\d{2,4}/g },
  { type: 'LAB',    re: /עב["״]ל\s*\d{1,5}[/]\d{2,4}/g },
  { type: 'TA',     re: /ת["״]א\s*[-]?\d{1,8}[-]\d{2,4}/g },
  { type: 'ADMIN',  re: /עת["״]מ\s*[-]?\d{1,8}[-]\d{2,4}/g },
  { type: 'FAMILY', re: /תמ["״]ש\s*[-]?\d{1,8}[-]\d{2,4}/g },
  { type: 'OTHER',  re: /בש["״]א\s*\d{1,5}[/]\d{2,4}/g },
];

function extractCitations(text: string, sourceDocumentId: string): VerdictCitationInput[] {
  const results: VerdictCitationInput[] = [];
  const seen = new Set<string>();
  for (const { type, re } of CITATION_PATTERNS) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const citationText = m[0].trim();
      if (seen.has(citationText)) continue;
      seen.add(citationText);
      const s   = Math.max(0, (m.index ?? 0) - 100);
      const e   = Math.min(text.length, (m.index ?? 0) + citationText.length + 100);
      const ctx = text.slice(s, e).replace(/\s+/g, ' ').trim().slice(0, 200);
      results.push({
        sourceDocumentId,
        citationText,
        citationType: type as VerdictCitationInput['citationType'],
        confidence: 0.85,
        contextSnippet: ctx,
      });
    }
  }
  return results;
}

// ── JSONL reader ───────────────────────────────────────────────────────────

async function readJsonl(filePath: string): Promise<unknown[]> {
  const records: unknown[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    try { records.push(JSON.parse(t)); } catch { /* skip malformed lines */ }
  }
  return records;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  process.stdout.write(`[ingest-case-law-israel] Starting: ${INPUT_FILE}\n`);

  const db     = new DatabaseConnection(DB_PATH);
  const runner = new MigrationRunner(db, MIGRATIONS_DIR);
  runner.runAll();

  const legalDocs    = new LegalDocumentRepository(db);
  const sourceReg    = new LegalSourceRegistryRepository(db);
  const citations    = new VerdictCitationRepository(db);
  const progress     = new LegalIngestionProgressRepository(db);
  const _embeddings  = new LegalDocumentEmbeddingRepository(db); // initialized to activate vec check

  const source = sourceReg.getBySourceId(SOURCE_ID);
  if (!source) throw new Error(`Source not registered: ${SOURCE_ID}. Run migrations first.`);

  // Resume check
  const existingProgress = progress.get(SOURCE_ID);
  let resumeBatch = 0;
  if (existingProgress?.status === 'RUNNING') {
    if (!RESUME) {
      process.stdout.write(`Interrupted ingestion at batch ${existingProgress.lastBatch}. Use --resume to continue.\n`);
      process.exit(0);
    }
    resumeBatch = existingProgress.lastBatch;
    process.stdout.write(`Resuming from batch ${resumeBatch}...\n`);
  }

  process.stdout.write('[ingest-case-law-israel] Reading JSONL...\n');
  const records = await readJsonl(INPUT_FILE);
  process.stdout.write(`[ingest-case-law-israel] ${records.length} records loaded\n`);

  // Validation pass
  let validCount    = 0;
  let rejectedCount = 0;
  const rejectionReasons: Record<string, number> = {};
  const validRecords: unknown[] = [];

  for (const rec of records) {
    if (!rec || typeof rec !== 'object') {
      rejectedCount++;
      rejectionReasons['malformed'] = (rejectionReasons['malformed'] ?? 0) + 1;
      continue;
    }
    const obj  = rec as Record<string, unknown>;
    const text = String(obj['document_text'] ?? obj['text'] ?? obj['verbatim_text_he'] ?? '').trim();
    const id   = obj['judgment_id'] ?? obj['doc_key'] ?? obj['id'];
    if (!id)           { rejectedCount++; rejectionReasons['missing_id']       = (rejectionReasons['missing_id'] ?? 0) + 1; continue; }
    if (text.length < 50) { rejectedCount++; rejectionReasons['text_too_short'] = (rejectionReasons['text_too_short'] ?? 0) + 1; continue; }
    if (text.includes('\x00')) { rejectedCount++; rejectionReasons['invalid_utf8'] = (rejectionReasons['invalid_utf8'] ?? 0) + 1; continue; }
    validCount++;
    validRecords.push(rec);
  }

  // Save validation report
  const validationReport = {
    source_id: SOURCE_ID, run_at: new Date().toISOString(),
    total_rows: records.length, valid_rows: validCount,
    rejected_rows: rejectedCount, rejection_reasons: rejectionReasons,
  };
  const validationPath = join(process.cwd(), 'ingest-validation-report.json');
  await writeFile(validationPath, JSON.stringify(validationReport, null, 2), 'utf8');
  process.stdout.write(`[ingest-case-law-israel] Validation: ${validCount} valid, ${rejectedCount} rejected → ${validationPath}\n`);

  // Start ingestion
  progress.start(SOURCE_ID, validRecords.length);

  const adapter      = new CaseLawIsraelAdapter();
  let inserted       = 0;
  let duplicates     = 0;
  let citationCount  = 0;
  const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);

  process.stdout.write(`[event] verdict-corpus:start total=${validRecords.length}\n`);

  for (let b = 0; b < totalBatches; b++) {
    if (b < resumeBatch) continue;
    if (MAX_DOCS && inserted >= MAX_DOCS) break;

    const batch = validRecords.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const { documents } = adapter.transform(batch);

    for (const doc of documents) {
      // Content-hash dedup
      const hash = createHash('sha256').update(doc.text).digest('hex');
      if (legalDocs.findByContentHash(hash)) { duplicates++; continue; }

      const documentId = legalDocs.insert({ ...doc, sourceId: source.id, contentHash: hash });
      inserted++;

      if (EXTRACT_CITE) {
        const cites = extractCitations(doc.text, documentId);
        if (cites.length > 0) citationCount += citations.bulkInsert(cites);
      }
    }

    const elapsedMs = Date.now() - startTime;
    progress.updateProgress(SOURCE_ID, {
      lastBatch: b + 1, lastLine: (b + 1) * BATCH_SIZE,
      processed: inserted, rejected: rejectedCount, duplicates, elapsedMs,
    });

    const pct = Math.round((inserted / validRecords.length) * 100);
    process.stdout.write(`[event] verdict-corpus:progress processed=${inserted} total=${validRecords.length} percent=${pct}\n`);
  }

  progress.complete(SOURCE_ID);
  sourceReg.markIngested(SOURCE_ID, inserted);

  const totalMs = Date.now() - startTime;
  process.stdout.write(`[event] verdict-corpus:completed processed=${inserted}\n`);

  // Corpus versioning
  const runHash = createHash('sha256').update(`${SOURCE_ID}:${inserted}:${new Date().toISOString()}`).digest('hex');
  const version = `${SOURCE_ID}-${new Date().toISOString().slice(0, 10)}`;
  db.prepare("INSERT OR REPLACE INTO SystemSettings (key, value) VALUES ('verdict_corpus_version', ?)").run(version);
  db.prepare("INSERT OR REPLACE INTO SystemSettings (key, value) VALUES ('verdict_corpus_sha256', ?)").run(runHash);
  db.prepare(`
    INSERT INTO CorpusVersionHistory (source_id, corpus_version, corpus_sha256, document_count, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(SOURCE_ID, version, runHash, inserted, `inserted=${inserted} dupes=${duplicates} rejected=${rejectedCount}`);

  // Benchmark report
  const stats        = legalDocs.stats();
  const citeStats    = citations.stats();
  const benchReport  = {
    timestamp: new Date().toISOString(), source_id: SOURCE_ID,
    total_documents: stats.total, inserted, duplicates,
    rejected: rejectedCount, citations_extracted: citationCount,
    import_duration_ms: totalMs, elapsed_sec: Math.round(totalMs / 1000),
    rejection_reasons: rejectionReasons, citation_stats: citeStats, corpus_stats: stats,
  };
  const benchPath = join(process.cwd(), 'legal-corpus-benchmark.json');
  await writeFile(benchPath, JSON.stringify(benchReport, null, 2), 'utf8');

  process.stdout.write(`\n✓ Complete: inserted=${inserted} dupes=${duplicates} rejected=${rejectedCount} citations=${citationCount} elapsed=${Math.round(totalMs / 1000)}s\n`);
  process.stdout.write(`Benchmark: ${benchPath}\nValidation: ${validationPath}\n`);
}

main().catch(err => { process.stderr.write(String(err) + '\n'); process.exit(1); });
