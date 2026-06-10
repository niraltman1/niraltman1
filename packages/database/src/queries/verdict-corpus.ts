import type { DatabaseConnection } from '../connection.js';

/**
 * Verbatim verdict corpus (migration 063) — bulk Israeli court rulings ingested from
 * public open datasets, used for keyword/semantic retrieval. This layer NEVER authors
 * or paraphrases legal text: callers pass already-verbatim ruling text, and each row
 * self-documents its provenance (sourceDataset) and that it is a point-in-time snapshot.
 */

export interface VerdictInput {
  docKey:        string;          // stable dataset doc hash — idempotency key
  caseNumber?:   string | null;
  caseName?:     string | null;
  court?:        string | null;
  verdictType?:  string | null;
  verdictDate?:  string | null;
  year?:         number | null;
  judges?:       string[];
  parties?:      string[];
  lawyers?:      string[];
  verbatimText:  string;
  sourceDataset: string;
  snapshotLabel: string;
  sourceLicense?: string | null;
}

export interface VerdictRow {
  readonly id:            number;
  readonly docKey:        string;
  readonly caseNumber:    string | null;
  readonly caseName:      string | null;
  readonly court:         string | null;
  readonly verdictType:   string | null;
  readonly verdictDate:   string | null;
  readonly year:          number | null;
  readonly judges:        string[];
  readonly parties:       string[];
  readonly lawyers:       string[];
  readonly verbatimText:  string;
  readonly charCount:     number;
  readonly sourceDataset: string;
  readonly snapshotLabel: string;
  readonly sourceLicense: string | null;
  readonly fetchedAt:     string | null;
  readonly isActive:      boolean;
}

export interface VerdictSearchHit {
  readonly id:          number;
  readonly docKey:      string;
  readonly caseNumber:  string | null;
  readonly caseName:    string | null;
  readonly court:       string | null;
  readonly verdictType: string | null;
  readonly verdictDate: string | null;
  readonly year:        number | null;
  readonly snippet:     string;
}

export interface VerdictCorpusStats {
  readonly verdicts: number;
  readonly embedded: number;
  readonly courts:   number;
}

function parseList(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapVerdict(r: Record<string, unknown>): VerdictRow {
  return {
    id:            r['id']               as number,
    docKey:        r['doc_key']          as string,
    caseNumber:    (r['case_number']      as string | null) ?? null,
    caseName:      (r['case_name']        as string | null) ?? null,
    court:         (r['court']            as string | null) ?? null,
    verdictType:   (r['verdict_type']     as string | null) ?? null,
    verdictDate:   (r['verdict_date']     as string | null) ?? null,
    year:          r['year'] != null ? Number(r['year']) : null,
    judges:        parseList(r['judges_json']),
    parties:       parseList(r['parties_json']),
    lawyers:       parseList(r['lawyers_json']),
    verbatimText:  r['verbatim_text_he'] as string,
    charCount:     Number(r['char_count'] ?? 0),
    sourceDataset: r['source_dataset']   as string,
    snapshotLabel: r['snapshot_label']   as string,
    sourceLicense: (r['source_license']   as string | null) ?? null,
    fetchedAt:     (r['fetched_at']       as string | null) ?? null,
    isActive:      Number(r['is_active'] ?? 1) === 1,
  };
}

export class VerdictCorpusRepository {
  constructor(private readonly db: DatabaseConnection) {}

  /** Insert or update a single ruling, keyed by its stable doc hash. Returns the row id. */
  upsertVerdict(input: VerdictInput): number {
    const text = input.verbatimText;
    this.db.prepare(`
      INSERT INTO VerdictCorpus
        (doc_key, case_number, case_name, court, verdict_type, verdict_date, year,
         judges_json, parties_json, lawyers_json, verbatim_text_he, char_count,
         source_dataset, snapshot_label, source_license, fetched_at)
      VALUES
        (@docKey, @caseNumber, @caseName, @court, @verdictType, @verdictDate, @year,
         @judges, @parties, @lawyers, @text, @chars,
         @sourceDataset, @snapshotLabel, @sourceLicense,
         strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(doc_key) DO UPDATE SET
        case_number      = excluded.case_number,
        case_name        = excluded.case_name,
        court            = excluded.court,
        verdict_type     = excluded.verdict_type,
        verdict_date     = excluded.verdict_date,
        year             = excluded.year,
        judges_json      = excluded.judges_json,
        parties_json     = excluded.parties_json,
        lawyers_json     = excluded.lawyers_json,
        verbatim_text_he = excluded.verbatim_text_he,
        char_count       = excluded.char_count,
        source_dataset   = excluded.source_dataset,
        snapshot_label   = excluded.snapshot_label,
        source_license   = excluded.source_license,
        fetched_at       = excluded.fetched_at,
        updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run({
      docKey:        input.docKey,
      caseNumber:    input.caseNumber   ?? null,
      caseName:      input.caseName     ?? null,
      court:         input.court        ?? null,
      verdictType:   input.verdictType  ?? null,
      verdictDate:   input.verdictDate  ?? null,
      year:          input.year         ?? null,
      judges:        JSON.stringify(input.judges  ?? []),
      parties:       JSON.stringify(input.parties ?? []),
      lawyers:       JSON.stringify(input.lawyers ?? []),
      text,
      chars:         text.length,
      sourceDataset: input.sourceDataset,
      snapshotLabel: input.snapshotLabel,
      sourceLicense: input.sourceLicense ?? null,
    });
    const row = this.db.prepare('SELECT id FROM VerdictCorpus WHERE doc_key = ?')
      .get(input.docKey) as { id: number };
    return row.id;
  }

  /** Bulk upsert inside a single transaction. Returns the number of rows written. */
  bulkUpsert(inputs: VerdictInput[]): number {
    return this.db.transaction<number>(() => {
      let n = 0;
      for (const input of inputs) { this.upsertVerdict(input); n++; }
      return n;
    });
  }

  getByDocKey(docKey: string): VerdictRow | null {
    const row = this.db.prepare('SELECT * FROM VerdictCorpus WHERE doc_key = ?')
      .get(docKey) as Record<string, unknown> | undefined;
    return row ? mapVerdict(row) : null;
  }

  listRecent(opts: { court?: string; limit?: number } = {}): VerdictRow[] {
    const limit = opts.limit ?? 50;
    const sql = opts.court
      ? `SELECT * FROM VerdictCorpus WHERE is_active = 1 AND court = @court
         ORDER BY year DESC, id DESC LIMIT @limit`
      : `SELECT * FROM VerdictCorpus WHERE is_active = 1
         ORDER BY year DESC, id DESC LIMIT @limit`;
    const rows = this.db.prepare(sql)
      .all(opts.court ? { court: opts.court, limit } : { limit }) as Record<string, unknown>[];
    return rows.map(mapVerdict);
  }

  /**
   * Full-text keyword search over verbatim rulings, optionally scoped to one court.
   * Returns a short snippet per hit — never the full ruling (callers fetch that by key).
   */
  searchVerdicts(query: string, opts: { court?: string; limit?: number } = {}): VerdictSearchHit[] {
    const limit = opts.limit ?? 20;
    const base = `
      SELECT v.id, v.doc_key, v.case_number, v.case_name, v.court,
             v.verdict_type, v.verdict_date, v.year,
             snippet(fts_verdict_corpus, 2, '[', ']', ' … ', 12) AS snippet
      FROM fts_verdict_corpus f
      JOIN VerdictCorpus v ON v.id = f.rowid
      WHERE fts_verdict_corpus MATCH @query AND v.is_active = 1
    `;
    const sql = opts.court
      ? `${base} AND v.court = @court ORDER BY rank LIMIT @limit`
      : `${base} ORDER BY rank LIMIT @limit`;
    const rows = this.db.prepare(sql).all({
      query, limit, ...(opts.court ? { court: opts.court } : {}),
    }) as Record<string, unknown>[];
    return rows.map((r) => ({
      id:          r['id']           as number,
      docKey:      r['doc_key']      as string,
      caseNumber:  (r['case_number']  as string | null) ?? null,
      caseName:    (r['case_name']    as string | null) ?? null,
      court:       (r['court']        as string | null) ?? null,
      verdictType: (r['verdict_type'] as string | null) ?? null,
      verdictDate: (r['verdict_date'] as string | null) ?? null,
      year:        r['year'] != null ? Number(r['year']) : null,
      snippet:     (r['snippet']      as string | null) ?? '',
    }));
  }

  upsertEmbedding(verdictId: number, embedding: number[], model = 'nomic-embed-text'): void {
    this.db.prepare(`
      INSERT INTO VerdictCorpusEmbeddings (verdict_id, embedding, model)
      VALUES (@verdictId, @embedding, @model)
      ON CONFLICT(verdict_id) DO UPDATE SET
        embedding = excluded.embedding, model = excluded.model
    `).run({ verdictId, embedding: JSON.stringify(embedding), model });
  }

  verdictsMissingEmbedding(limit = 200): VerdictRow[] {
    const rows = this.db.prepare(`
      SELECT v.* FROM VerdictCorpus v
      WHERE NOT EXISTS (SELECT 1 FROM VerdictCorpusEmbeddings e WHERE e.verdict_id = v.id)
      ORDER BY v.id
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(mapVerdict);
  }

  stats(): VerdictCorpusStats {
    const verdicts = (this.db.prepare('SELECT COUNT(*) AS n FROM VerdictCorpus WHERE is_active = 1').get() as { n: number }).n;
    const embedded = (this.db.prepare('SELECT COUNT(*) AS n FROM VerdictCorpusEmbeddings').get() as { n: number }).n;
    const courts   = (this.db.prepare('SELECT COUNT(DISTINCT court) AS n FROM VerdictCorpus WHERE court IS NOT NULL').get() as { n: number }).n;
    return { verdicts, embedded, courts };
  }
}
