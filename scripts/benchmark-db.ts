#!/usr/bin/env tsx
/**
 * DB query latency benchmark for PERFORMANCE_REPORT.md.
 *
 * Builds a fresh, fully-migrated SQLite DB in a temp file, seeds it with a
 * synthetic dataset roughly the size of a busy boutique-firm install
 * (thousands of clients/cases/documents with Hebrew OCR text so the FTS5
 * index has realistic content to search), then times representative
 * read queries that the live API issues on hot paths.
 *
 * Usage: pnpm exec tsx scripts/benchmark-db.ts
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseConnection, MigrationRunner } from '@factum-il/database';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const N_CLIENTS   = 2_000;
const N_CASES     = 4_000;
const N_DOCUMENTS = 30_000;
const N_RUNS      = 50;

const HEBREW_PARAGRAPHS = [
  'הנדון: כתב תביעה בגין הפרת חוזה שכירות ופיצויים בגין נזקים שנגרמו לדירה במהלך תקופת השכירות.',
  'בית המשפט לענייני משפחה קבע כי יש לחלק את העיזבון בהתאם לצוואה שהוצגה ואושרה על ידי הרשם לענייני ירושה.',
  'הנאשם הואשם בעבירת נהיגה בשכרות בניגוד לפקודת התעבורה, ונגזר עליו עונש של פסילת רישיון נהיגה למשך שנה.',
  'הצדדים הגיעו להסכם פשרה לפיו הנתבעת תשלם לתובע סך של חמישים אלף שקלים חדשים בארבעה תשלומים שווים.',
  'בקשה למתן צו מניעה זמני נגד המשיבה, אשר פעלה בניגוד להסכם הסודיות שנחתם בין הצדדים בתחילת ההתקשרות.',
  'ערעור על פסק דינו של בית משפט השלום בתל אביב בעניין תביעת נזיקין שהוגשה בגין תאונת דרכים.',
  'חוות דעת מומחה בתחום הראיות הדיגיטליות, הכוללת ניתוח של הודעות טקסט ותכתובות דואר אלקטרוני.',
  'כתב הגנה מטעם הנתבע, הכופר בעובדות הנטענות בכתב התביעה וטוען להתיישנות העילה.',
];

interface BenchResult {
  name:       string;
  iterations: number;
  totalMs:    number;
  avgMs:      number;
  p50Ms:      number;
  p95Ms:      number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function bench(name: string, iterations: number, fn: () => void): BenchResult {
  // warm-up
  for (let i = 0; i < 3; i++) fn();

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    samples.push(Number(end - start) / 1_000_000);
  }
  samples.sort((a, b) => a - b);
  const totalMs = samples.reduce((a, b) => a + b, 0);
  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
  };
}

function fmt(r: BenchResult): string {
  return `${r.name.padEnd(46)} avg=${r.avgMs.toFixed(3)}ms  p50=${r.p50Ms.toFixed(3)}ms  p95=${r.p95Ms.toFixed(3)}ms  (n=${r.iterations})`;
}

function seed(conn: DatabaseConnection): void {
  const db = conn.raw;
  const rand = (n: number): number => Math.floor(Math.random() * n);
  const pick = <T>(arr: T[]): T => arr[rand(arr.length)]!;

  const insertClient = db.prepare(
    `INSERT INTO Clients (name_he, name_en, id_type, id_number, phone, email, address_he)
     VALUES (?, ?, 'personal', ?, ?, ?, ?)`,
  );
  const insertCase = db.prepare(
    `INSERT INTO Cases (client_id, case_number, title_he, case_type, procedure_type, status, court_name, opened_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDoc = db.prepare(
    `INSERT INTO Documents
       (file_hash, original_path, storage_path, filename, extension, file_size_bytes,
        case_id, document_type, ocr_text, processing_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, '.pdf', ?, ?, 'pdf', ?, 'VERIFIED', ?, ?)`,
  );

  const txClients = db.transaction((n: number) => {
    for (let i = 0; i < n; i++) {
      insertClient.run(`לקוח מספר ${i}`, `Client ${i}`, `${100000000 + i}`, `050-${1000000 + i}`, `client${i}@example.com`, `רחוב הדוגמה ${i}, תל אביב`);
    }
  });
  const txCases = db.transaction((n: number) => {
    const caseTypes      = ['civil', 'criminal', 'family', 'labor', 'traffic_administrative'] as const;
    const procedureTypes = ['civil', 'traffic_administrative', 'traffic_criminal', 'academic'] as const;
    for (let i = 0; i < n; i++) {
      const clientId = 1 + rand(N_CLIENTS);
      insertCase.run(
        clientId, `${1000 + i}-0${1 + rand(9)}-2${rand(6)}`, `תיק מספר ${i} — ${pick(caseTypes)}`,
        pick(caseTypes), pick(procedureTypes), pick(['open', 'closed', 'suspended']),
        pick(['בית משפט שלום תל אביב', 'בית משפט מחוזי ירושלים', 'בית משפט לענייני משפחה חיפה']),
        `202${rand(6)}-0${1 + rand(9)}-${10 + rand(19)}`,
      );
    }
  });
  const txDocs = db.transaction((n: number) => {
    const now = new Date().toISOString();
    for (let i = 0; i < n; i++) {
      const caseId = 1 + rand(N_CASES);
      const text = `${pick(HEBREW_PARAGRAPHS)} ${pick(HEBREW_PARAGRAPHS)} (מסמך מס׳ ${i})`;
      const path = `/data/cases/${caseId}/document-${i}.pdf`;
      insertDoc.run(`hash-${i}-${rand(1_000_000)}`, path, path, `document-${i}.pdf`, 1024 * (10 + rand(500)), caseId, text, now, now);
    }
  });

  txClients(N_CLIENTS);
  txCases(N_CASES);
  txDocs(N_DOCUMENTS);
}

async function main(): Promise<void> {
  const dir    = await mkdtemp(join(tmpdir(), 'factum-il-bench-'));
  const dbPath = join(dir, 'bench.db');

  console.log(`[benchmark-db] building fully-migrated DB at ${dbPath} ...`);
  const conn = new DatabaseConnection({ path: dbPath });
  new MigrationRunner(conn, MIGRATIONS_DIR).run();
  const raw = conn.raw;

  console.log(`[benchmark-db] seeding ${N_CLIENTS} clients, ${N_CASES} cases, ${N_DOCUMENTS} documents ...`);
  const seedStart = Date.now();
  seed(conn);
  console.log(`[benchmark-db] seed complete in ${((Date.now() - seedStart) / 1000).toFixed(1)}s`);
  raw.pragma('optimize');

  const results: BenchResult[] = [];

  results.push(bench('Case lookup by id (PK point query)', N_RUNS, () => {
    const id = 1 + Math.floor(Math.random() * N_CASES);
    raw.prepare('SELECT * FROM Cases WHERE id = ?').get(id);
  }));

  results.push(bench('Case list by client_id (indexed FK scan)', N_RUNS, () => {
    const clientId = 1 + Math.floor(Math.random() * N_CLIENTS);
    raw.prepare('SELECT * FROM Cases WHERE client_id = ? ORDER BY opened_date DESC LIMIT 20').all(clientId);
  }));

  results.push(bench('Documents by case_id (indexed FK scan)', N_RUNS, () => {
    const caseId = 1 + Math.floor(Math.random() * N_CASES);
    raw.prepare('SELECT id, filename, document_type FROM Documents WHERE case_id = ? LIMIT 50').all(caseId);
  }));

  // FTS5 full-text search over ocr_text — same shape as routes/search.ts hot path
  let ftsAvailable = false;
  try {
    raw.prepare(`SELECT rowid FROM fts_documents WHERE fts_documents MATCH 'תביעה' LIMIT 1`).get();
    ftsAvailable = true;
  } catch (err) {
    console.warn(`[benchmark-db] fts_documents not queryable — skipping FTS benchmark (${String(err)})`);
  }
  if (ftsAvailable) {
    const terms = ['תביעה', 'חוזה', 'ירושה', 'נהיגה', 'פיצויים', 'ערעור'];
    results.push(bench('FTS5 search on Documents.ocr_text (BM25 rank)', N_RUNS, () => {
      const term = terms[Math.floor(Math.random() * terms.length)];
      raw.prepare(
        `SELECT rowid, filename FROM fts_documents WHERE fts_documents MATCH ? ORDER BY rank LIMIT 20`,
      ).all(term);
    }));
  }

  // Vector KNN — DatabaseConnection auto-loads sqlite-vec from SQLITE_VEC_PATH
  // (see connection.ts); we only benchmark the native path if it actually loaded.
  let vecAvailable = false;
  if (!process.env['SQLITE_VEC_PATH']) {
    console.warn('[benchmark-db] SQLITE_VEC_PATH not set — skipping vector KNN benchmark (JS-cosine fallback is the live path in this environment)');
  } else {
    try {
      raw.prepare(`SELECT vec_version()`).get();
      raw.prepare(`SELECT rowid FROM vec_chunks LIMIT 1`).get();
      vecAvailable = true;
    } catch (err) {
      console.warn(`[benchmark-db] sqlite-vec / vec_chunks not available — skipping vector KNN benchmark (${String(err)})`);
    }
  }
  if (vecAvailable) {
    results.push(bench('vec_chunks KNN (sqlite-vec native)', N_RUNS, () => {
      const probe = JSON.stringify(Array.from({ length: 768 }, () => Math.random()));
      raw.prepare(
        `SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH vec_f32(?) ORDER BY distance LIMIT 10`,
      ).all(probe);
    }));
  }

  console.log('\n=== DB Query Latency Benchmark ===');
  console.log(`Dataset: ${N_CLIENTS} clients · ${N_CASES} cases · ${N_DOCUMENTS} documents (Hebrew OCR text)\n`);
  for (const r of results) console.log(fmt(r));

  conn.close();
  await rm(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('[benchmark-db] failed:', err);
  process.exitCode = 1;
});
