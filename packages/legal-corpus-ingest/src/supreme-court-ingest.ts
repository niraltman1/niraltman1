import { existsSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseCitation, canonicalizeCitation } from '@factum-il/citation-engine';
import { chunkDocument } from '@factum-il/retrieval';

const SUMMARY_CHARS = 600;
const BATCH_SIZE = 200;

// Shape of one factum_il_mvp.jsonl record (validated against a real 4-record sample —
// see migrations 070-072 for the schema this maps onto).
export interface SupremeCourtSourceRecord {
  id:        string;       // raw citation string, e.g. 'ע"א 248/97' — NOT a numeric id
  case_name: string;
  court?:    string | null;
  case_type?: string | null;
  date?:     string | null;
  judges?:   string | null; // Python-repr-like: "['אהרן ברק' 'אליהו מצא']" — not valid JSON
  text:      string;
  embedding: number[];      // pre-computed, 768-dim — loaded as-is, NEVER re-embedded
}

export interface IngestSupremeCourtOptions {
  jsonlPath: string;
  limit?:    number | null; // cap records read (smoke testing)
}

export interface IngestSupremeCourtSummary {
  read:             number;
  inserted:         number;
  duplicates:       number;
  skipped:          number;
  chunks:           number;
  embeddingsLoaded: number;
  elapsedMs:        number;
}

interface PreparedStatement {
  run: (...args: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...args: unknown[]) => unknown;
}

export interface IngestDbHandle {
  prepare:     (sql: string) => PreparedStatement;
  transaction: <T>(fn: () => T) => T;
}

/**
 * TS port of Python `re.findall(r"'([^']*)'", judges_str)`.
 * The dataset's "judges" field is a Python-repr-style string with no commas
 * (e.g. "['אהרן ברק' 'אליהו מצא']") — invalid JSON, so we extract quoted names by regex
 * and re-serialize as a proper JSON array for judges_json.
 */
export function parseJudges(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const matches = raw.match(/'([^']*)'/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1)).filter((name) => name.trim().length > 0);
}

// True de-dup key: citation_raw alone is not guaranteed unique pre-normalization,
// so we hash (citation_raw + text) — mirrors the rationale documented in migration 070.
function docHash(citationRaw: string, text: string): string {
  return createHash('sha256').update(`${citationRaw} ${text}`, 'utf-8').digest('hex');
}

function deriveYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = /^(\d{4})/.exec(dateStr.trim());
  return m ? Number(m[1]) : null;
}

interface ParsedRecord {
  hash:        string;
  citationRaw: string;
  citation:    string | null;
  caseName:    string;
  court:       string | null;
  caseType:    string | null;
  verdictDt:   string | null;
  year:        number | null;
  judgesJson:  string;
  summaryHe:   string;
  text:        string;
  embedding:   number[];
}

function parseLine(raw: string): ParsedRecord | null {
  let rec: SupremeCourtSourceRecord;
  try {
    rec = JSON.parse(raw) as SupremeCourtSourceRecord;
  } catch {
    return null;
  }
  if (!rec.id || !rec.case_name || !rec.text || !Array.isArray(rec.embedding)) return null;

  const citationRaw = String(rec.id).trim();
  const text = rec.text;
  const parsed = parseCitation(citationRaw);

  return {
    hash:        docHash(citationRaw, text),
    citationRaw,
    citation:    parsed ? canonicalizeCitation(citationRaw) : null,
    caseName:    rec.case_name,
    court:       rec.court ?? null,
    caseType:    rec.case_type ?? null,
    verdictDt:   rec.date ?? null,
    year:        deriveYear(rec.date),
    judgesJson:  JSON.stringify(parseJudges(rec.judges)),
    summaryHe:   text.slice(0, SUMMARY_CHARS),
    text,
    embedding:   rec.embedding,
  };
}

/**
 * Bulk-load the Supreme Court MVP corpus (factum_il_mvp.jsonl, ~20K verdicts with
 * pre-computed 768-dim embeddings) into SupremeCourtVerdicts + PrecedentChunks +
 * vec_precedent_verdicts (migrations 070-072).
 *
 * The dataset ships ONE embedding per verdict — this function loads it directly
 * into vec_precedent_verdicts (rowid == verdict id) via vec_f32(). It never calls
 * an embedding model; re-embedding would be both wasteful and a privacy risk
 * (the embeddings are already computed offline, see migration 072).
 *
 * Idempotent: re-running skips records whose hf_doc_hash already exists.
 */
export async function ingestSupremeCourtCorpus(
  opts: IngestSupremeCourtOptions,
  db:   IngestDbHandle,
): Promise<IngestSupremeCourtSummary> {
  const start = Date.now();
  const summary: IngestSupremeCourtSummary = {
    read: 0, inserted: 0, duplicates: 0, skipped: 0, chunks: 0, embeddingsLoaded: 0, elapsedMs: 0,
  };

  if (!existsSync(opts.jsonlPath)) {
    throw new Error(`[factum-il-sc] JSONL not found: ${opts.jsonlPath}`);
  }

  const insertVerdict = db.prepare(`
    INSERT OR IGNORE INTO SupremeCourtVerdicts
      (hf_doc_hash, citation_raw, citation, case_name, court, case_type, verdict_dt, year, judges_json, summary_he, embedding_done)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const insertChunk = db.prepare(`
    INSERT INTO PrecedentChunks (verdict_id, chunk_index, chunk_text, char_start, char_end)
    VALUES (?, ?, ?, ?, ?)
  `);
  const markEmbedded = db.prepare('UPDATE SupremeCourtVerdicts SET embedding_done = 1 WHERE id = ?');

  // The vec0 virtual table requires the sqlite-vec extension (migration 072 is
  // SKIP_ON_ERROR — it may not have applied). Probe once: if preparing against it
  // fails, skip all vector inserts for this run; verdicts stay embedding_done = 0
  // and a later pass (once 072 applies successfully) can backfill them.
  let insertVec: PreparedStatement | null = null;
  try {
    insertVec = db.prepare('INSERT OR REPLACE INTO vec_precedent_verdicts (rowid, embedding) VALUES (?, vec_f32(?))');
  } catch {
    process.stdout.write(
      '[factum-il-sc] vec_precedent_verdicts unavailable (sqlite-vec not loaded) — ' +
      'loading verdicts/chunks only; embeddings will be backfilled once migration 072 applies.\n',
    );
  }

  const ciAnnotations = process.env['GITHUB_ACTIONS'] === 'true';

  const flushBatch = (records: ParsedRecord[]): void => {
    db.transaction(() => {
      for (const rec of records) {
        const result = insertVerdict.run(
          rec.hash, rec.citationRaw, rec.citation, rec.caseName, rec.court,
          rec.caseType, rec.verdictDt, rec.year, rec.judgesJson, rec.summaryHe,
        );
        if (result.changes === 0) {
          summary.duplicates += 1;
          continue;
        }
        const verdictId = Number(result.lastInsertRowid);

        const chunks = chunkDocument(rec.text, verdictId);
        chunks.forEach((chunk, chunkIndex) => {
          insertChunk.run(verdictId, chunkIndex, chunk.text, chunk.charStart, chunk.charEnd);
        });
        summary.chunks += chunks.length;

        if (insertVec) {
          insertVec.run(verdictId, JSON.stringify(rec.embedding));
          markEmbedded.run(verdictId);
          summary.embeddingsLoaded += 1;
        }

        summary.inserted += 1;
      }
    });
  };

  const input = opts.jsonlPath.endsWith('.gz')
    ? createReadStream(opts.jsonlPath).pipe(createGunzip())
    : createReadStream(opts.jsonlPath);
  const rl = createInterface({ input, crlfDelay: Infinity });

  let batch: ParsedRecord[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (opts.limit != null && summary.read >= opts.limit) break;

    summary.read += 1;
    const parsed = parseLine(trimmed);
    if (!parsed) {
      summary.skipped += 1;
      continue;
    }
    batch.push(parsed);

    if (batch.length >= BATCH_SIZE) {
      flushBatch(batch);
      batch = [];
      const progress = `[factum-il-sc] ${summary.inserted} loaded, ${summary.duplicates} dup, ` +
        `${summary.skipped} skipped, ${summary.embeddingsLoaded} embedded (read ${summary.read})\n`;
      if (ciAnnotations) process.stdout.write(`::notice title=Supreme Court Ingest::${progress}`);
      else process.stdout.write(progress);
    }
  }
  if (batch.length > 0) flushBatch(batch);

  summary.elapsedMs = Date.now() - start;
  process.stdout.write(
    `[factum-il-sc] done: read=${summary.read} inserted=${summary.inserted} ` +
    `duplicates=${summary.duplicates} skipped=${summary.skipped} chunks=${summary.chunks} ` +
    `embeddings=${summary.embeddingsLoaded} elapsed=${summary.elapsedMs}ms\n`,
  );
  return summary;
}
