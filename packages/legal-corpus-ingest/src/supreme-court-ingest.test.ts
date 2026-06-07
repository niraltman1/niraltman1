import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseConnection, MigrationRunner } from '@factum-il/database';
import { ingestSupremeCourtCorpus, parseJudges, type IngestDbHandle } from './supreme-court-ingest.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', '..', 'migrations');

function makeRecord(id: string, caseName: string, text: string): string {
  return JSON.stringify({
    id,
    case_name: caseName,
    court: 'בית המשפט העליון',
    case_type: 'ע"א',
    date: '1997-03-20',
    judges: "['אהרן ברק' 'אליהו מצא']",
    text,
    embedding: Array.from({ length: 8 }, (_, i) => i / 8),
  });
}

describe('parseJudges', () => {
  it('extracts names from the Python-repr-like judges string', () => {
    expect(parseJudges("['אהרן ברק' 'אליהו מצא']")).toEqual(['אהרן ברק', 'אליהו מצא']);
  });

  it('returns an empty array for null/empty input', () => {
    expect(parseJudges(null)).toEqual([]);
    expect(parseJudges('')).toEqual([]);
    expect(parseJudges('[]')).toEqual([]);
  });
});

describe('ingestSupremeCourtCorpus', () => {
  let dir: string;
  let db: DatabaseConnection;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sc-ingest-'));
    db = new DatabaseConnection({ path: ':memory:' });
    new MigrationRunner(db, MIGRATIONS_DIR).run();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads verdicts, chunks, and judges; skips malformed lines and duplicates', async () => {
    const longText = 'זהו טקסט פסק דין לדוגמה. '.repeat(120);
    const lines = [
      makeRecord('ע"א 248/97', 'פלוני נ\' אלמוני', longText),
      makeRecord('בג"ץ 6821/93', 'המפלגה הקומוניסטית נ\' שר הפנים', 'טקסט קצר.'),
      'not valid json',
      JSON.stringify({ id: 'missing fields' }),
      makeRecord('ע"א 248/97', 'פלוני נ\' אלמוני', longText), // duplicate of first (same id+text)
    ];
    const jsonlPath = join(dir, 'sample.jsonl');
    writeFileSync(jsonlPath, lines.join('\n') + '\n', 'utf-8');

    const summary = await ingestSupremeCourtCorpus({ jsonlPath }, db as unknown as IngestDbHandle);

    expect(summary.read).toBe(5);
    expect(summary.inserted).toBe(2);
    expect(summary.duplicates).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(summary.chunks).toBeGreaterThan(0);

    const verdicts = db.prepare('SELECT * FROM SupremeCourtVerdicts ORDER BY id').all() as Array<{
      id: number; citation_raw: string; citation: string | null; case_name: string; judges_json: string; year: number | null;
    }>;
    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]?.citation_raw).toBe('ע"א 248/97');
    expect(verdicts[0]?.year).toBe(1997);
    expect(JSON.parse(verdicts[0]?.judges_json ?? '[]')).toEqual(['אהרן ברק', 'אליהו מצא']);

    const chunkRows = db.prepare('SELECT verdict_id, chunk_text FROM PrecedentChunks').all() as Array<{
      verdict_id: number; chunk_text: string;
    }>;
    expect(chunkRows.length).toBe(summary.chunks);
    expect(chunkRows.every((r) => r.verdict_id === verdicts[0]?.id || r.verdict_id === verdicts[1]?.id)).toBe(true);

    // Full-text search over the synced FTS index finds the Hebrew chunk text.
    const ftsHits = db.prepare(`
      SELECT pc.chunk_text FROM fts_precedent_chunks f
      JOIN PrecedentChunks pc ON pc.id = f.rowid
      WHERE f.chunk_text MATCH 'לדוגמה'
    `).all() as Array<{ chunk_text: string }>;
    expect(ftsHits.length).toBeGreaterThan(0);
  });

  it('is idempotent — re-running skips already-ingested verdicts', async () => {
    const lines = [makeRecord('ע"א 1/01', 'שם תיק', 'טקסט פסק דין ראשון לבדיקה.')];
    const jsonlPath = join(dir, 'sample.jsonl');
    writeFileSync(jsonlPath, lines.join('\n') + '\n', 'utf-8');

    const first = await ingestSupremeCourtCorpus({ jsonlPath }, db as unknown as IngestDbHandle);
    expect(first.inserted).toBe(1);

    const second = await ingestSupremeCourtCorpus({ jsonlPath }, db as unknown as IngestDbHandle);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);

    const count = db.prepare('SELECT COUNT(*) AS n FROM SupremeCourtVerdicts').get() as { n: number };
    expect(count.n).toBe(1);
  });
});
