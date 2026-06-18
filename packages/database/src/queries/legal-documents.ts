<<<<<<< HEAD
import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../connection.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type VisibilityScope = 'PUBLIC' | 'PRIVATE' | 'SHARED';

export type LegalDocumentType =
  | 'VERDICT' | 'DECISION' | 'ORDER' | 'RULING'
  | 'STATUTE' | 'REGULATION' | 'GUIDELINE' | 'OTHER';

export type LegalSourceType = 'CASE_LAW' | 'LEGISLATION' | 'REGULATION' | 'GUIDELINE';

export type ProceedingType =
  | 'CIVIL' | 'CRIMINAL' | 'LABOR' | 'FAMILY'
  | 'ADMINISTRATIVE' | 'COMMERCIAL' | 'OTHER';

export interface LegalDocumentInput {
  sourceId:         number;
  sourceType:       LegalSourceType;
  sourceDataset:    string;
  sourceVersion?:   string | null;
  documentType:     LegalDocumentType;
  proceedingType?:  ProceedingType | null;
  court?:           string | null;
  caseNumber?:      string | null;
  title?:           string | null;
  date?:            string | null;
  year?:            number | null;
  judges?:          string[];
  parties?:         string[];
  lawyers?:         string[];
  text:             string;
  metadata?:        Record<string, unknown>;
  visibilityScope?: VisibilityScope;
  externalId?:      string | null;
  contentHash?:     string | null;
}

export interface LegalDocumentRow {
  readonly id:              number;
  readonly documentId:      string;    // FDOC-XXXXXXXX
  readonly sourceId:        number;
  readonly sourceType:      LegalSourceType;
  readonly sourceDataset:   string;
  readonly sourceVersion:   string | null;
  readonly documentType:    LegalDocumentType;
  readonly proceedingType:  ProceedingType | null;
  readonly court:           string | null;
  readonly caseNumber:      string | null;
  readonly title:           string | null;
  readonly date:            string | null;
  readonly year:            number | null;
  readonly judges:          string[];
  readonly parties:         string[];
  readonly lawyers:         string[];
  readonly text:            string;
  readonly charCount:       number;
  readonly metadata:        Record<string, unknown>;
  readonly visibilityScope: VisibilityScope;
  readonly canonicalCaseKey: string | null;
  readonly duplicateOfId:   number | null;
  readonly externalId:      string | null;
  readonly contentHash:     string | null;
  readonly isActive:        boolean;
  readonly createdAt:       string;
  readonly updatedAt:       string;
}

export interface LegalDocumentSearchHit {
  readonly documentId:   string;
  readonly title:        string | null;
  readonly caseNumber:   string | null;
  readonly court:        string | null;
  readonly date:         string | null;
  readonly sourceDataset: string;
  readonly snippet:      string;
  readonly rank:         number;
}

export interface LegalDocumentStats {
  readonly total:           number;
  readonly publicCount:     number;
  readonly bySource:        Array<{ source: string; count: number }>;
  readonly byDocumentType:  Array<{ type: string; count: number }>;
  readonly withEmbeddings:  number;
  readonly citationCount:   number;
}

// ── Internal DB row shapes ────────────────────────────────────────────────

interface RawDocRow {
  id: number;
  document_id: string;
  source_id: number;
  source_type: string;
  source_dataset: string;
  source_version: string | null;
  document_type: string;
  proceeding_type: string | null;
  court: string | null;
  case_number: string | null;
  title: string | null;
  date: string | null;
  year: number | null;
  judges_json: string;
  parties_json: string;
  lawyers_json: string;
  text: string;
  char_count: number;
  metadata_json: string;
  visibility_scope: string;
  canonical_case_key: string | null;
  duplicate_of_id: number | null;
  external_id: string | null;
  content_hash: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function toRow(raw: RawDocRow): LegalDocumentRow {
  return {
    id:              raw.id,
    documentId:      raw.document_id,
    sourceId:        raw.source_id,
    sourceType:      raw.source_type as LegalSourceType,
    sourceDataset:   raw.source_dataset,
    sourceVersion:   raw.source_version,
    documentType:    raw.document_type as LegalDocumentType,
    proceedingType:  raw.proceeding_type as ProceedingType | null,
    court:           raw.court,
    caseNumber:      raw.case_number,
    title:           raw.title,
    date:            raw.date,
    year:            raw.year,
    judges:          JSON.parse(raw.judges_json) as string[],
    parties:         JSON.parse(raw.parties_json) as string[],
    lawyers:         JSON.parse(raw.lawyers_json) as string[],
    text:            raw.text,
    charCount:       raw.char_count,
    metadata:        JSON.parse(raw.metadata_json) as Record<string, unknown>,
    visibilityScope: raw.visibility_scope as VisibilityScope,
    canonicalCaseKey: raw.canonical_case_key,
    duplicateOfId:   raw.duplicate_of_id,
    externalId:      raw.external_id,
    contentHash:     raw.content_hash,
    isActive:        raw.is_active === 1,
    createdAt:       raw.created_at,
    updatedAt:       raw.updated_at,
  };
}

function buildCanonicalCaseKey(court: string | null | undefined, caseNumber: string | null | undefined): string | null {
  if (!court && !caseNumber) return null;
  const c = (court ?? '').replace(/\s+/g, '').toLowerCase();
  const n = (caseNumber ?? '').replace(/[^א-תa-z0-9]/gi, '').toLowerCase();
  return `${c}::${n}`;
}

// ── Repository ────────────────────────────────────────────────────────────

export class LegalDocumentRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ── FDOC ID generation ───────────────────────────────────────────────

  private nextDocumentId(): string {
    const result = this.db.prepare(
      'INSERT INTO LegalDocumentIdSeq DEFAULT VALUES',
    ).run();
    const seq = result.lastInsertRowid as number;
    return `FDOC-${String(seq).padStart(8, '0')}`;
  }

  // ── Insert / Upsert ───────────────────────────────────────────────────

  insert(input: LegalDocumentInput): string {
    const documentId = this.nextDocumentId();
    const contentHash = input.contentHash ?? createHash('sha256').update(input.text).digest('hex');
    const canonicalCaseKey = buildCanonicalCaseKey(input.court, input.caseNumber);

    this.db.prepare(`
      INSERT INTO LegalDocuments (
        document_id, source_id, source_type, source_dataset, source_version,
        document_type, proceeding_type, court, case_number, title, date, year,
        judges_json, parties_json, lawyers_json, text, char_count,
        metadata_json, visibility_scope, canonical_case_key,
        external_id, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      documentId,
      input.sourceId,
      input.sourceType,
      input.sourceDataset,
      input.sourceVersion ?? null,
      input.documentType,
      input.proceedingType ?? null,
      input.court ?? null,
      input.caseNumber ?? null,
      input.title ?? null,
      input.date ?? null,
      input.year ?? null,
      JSON.stringify(input.judges ?? []),
      JSON.stringify(input.parties ?? []),
      JSON.stringify(input.lawyers ?? []),
      input.text,
      input.text.length,
      JSON.stringify(input.metadata ?? {}),
      input.visibilityScope ?? 'PUBLIC',
      canonicalCaseKey,
      input.externalId ?? null,
      contentHash,
    );

    return documentId;
  }

  bulkInsert(inputs: LegalDocumentInput[]): { inserted: number; documentIds: string[] } {
    const documentIds: string[] = [];
    this.db.transaction(() => {
      for (const input of inputs) {
        documentIds.push(this.insert(input));
      }
    });
    return { inserted: documentIds.length, documentIds };
  }

  // ── Deduplication ─────────────────────────────────────────────────────

  findByContentHash(contentHash: string): LegalDocumentRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalDocuments WHERE content_hash = ? AND is_active = 1 LIMIT 1',
    ).get(contentHash) as RawDocRow | undefined;
    return raw ? toRow(raw) : null;
  }

  findByCanonicalCaseKey(key: string): LegalDocumentRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalDocuments WHERE canonical_case_key = ? AND is_active = 1 LIMIT 1',
    ).get(key) as RawDocRow | undefined;
    return raw ? toRow(raw) : null;
  }

  findByExternalId(externalId: string, sourceDataset: string): LegalDocumentRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalDocuments WHERE external_id = ? AND source_dataset = ? LIMIT 1',
    ).get(externalId, sourceDataset) as RawDocRow | undefined;
    return raw ? toRow(raw) : null;
  }

  markDuplicate(documentId: string, duplicateOfId: number): void {
    this.db.prepare(`
      UPDATE LegalDocuments SET duplicate_of_id = ?, is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE document_id = ?
    `).run(duplicateOfId, documentId);
    this.db.prepare(`
      UPDATE LegalDocuments SET duplicate_count = duplicate_count + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(duplicateOfId);
  }

  // ── Read ──────────────────────────────────────────────────────────────

  getByDocumentId(documentId: string): LegalDocumentRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalDocuments WHERE document_id = ?',
    ).get(documentId) as RawDocRow | undefined;
    return raw ? toRow(raw) : null;
  }

  listRecent(opts: {
    sourceDataset?: string;
    court?:         string;
    documentType?:  LegalDocumentType;
    scope?:         VisibilityScope;
    limit?:         number;
    offset?:        number;
  } = {}): LegalDocumentRow[] {
    const conditions: string[] = ['is_active = 1'];
    const params: (string | number)[] = [];

    if (opts.sourceDataset) { conditions.push('source_dataset = ?'); params.push(opts.sourceDataset); }
    if (opts.court)         { conditions.push('court = ?');          params.push(opts.court); }
    if (opts.documentType)  { conditions.push('document_type = ?');  params.push(opts.documentType); }
    if (opts.scope)         { conditions.push('visibility_scope = ?'); params.push(opts.scope); }

    const limit  = opts.limit  ?? 50;
    const offset = opts.offset ?? 0;
    params.push(limit, offset);

    const rows = this.db.prepare(
      `SELECT * FROM LegalDocuments WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
    ).all(...params) as RawDocRow[];
    return rows.map(toRow);
  }

  // ── FTS5 Search ────────────────────────────────────────────────────────

  search(query: string, opts: {
    court?:         string;
    sourceDataset?: string;
    documentType?:  LegalDocumentType;
    scope?:         VisibilityScope;
    limit?:         number;
  } = {}): LegalDocumentSearchHit[] {
    const conditions: string[] = ['ld.is_active = 1'];
    const params: (string | number)[] = [query.trim() + '*'];

    if (opts.court)         { conditions.push('ld.court = ?');          params.push(opts.court); }
    if (opts.sourceDataset) { conditions.push('ld.source_dataset = ?'); params.push(opts.sourceDataset); }
    if (opts.documentType)  { conditions.push('ld.document_type = ?');  params.push(opts.documentType); }
    if (opts.scope)         { conditions.push('ld.visibility_scope = ?'); params.push(opts.scope); }

    const limit = opts.limit ?? 20;
    params.push(limit);

    const whereClause = conditions.length > 0
      ? `AND ${conditions.join(' AND ')}`
      : '';

    const rows = this.db.prepare(`
      SELECT ld.document_id, ld.title, ld.case_number, ld.court, ld.date, ld.source_dataset,
             snippet(fts_legal_documents, 3, '<em>', '</em>', '…', 32) as snippet,
             fts.rank
      FROM fts_legal_documents fts
      JOIN LegalDocuments ld ON ld.id = fts.rowid
      WHERE fts_legal_documents MATCH ?
        ${whereClause}
      ORDER BY fts.rank
      LIMIT ?
    `).all(...params) as Array<{
      document_id: string; title: string | null; case_number: string | null;
      court: string | null; date: string | null; source_dataset: string;
      snippet: string; rank: number;
    }>;

    return rows.map(r => ({
      documentId:    r.document_id,
      title:         r.title,
      caseNumber:    r.case_number,
      court:         r.court,
      date:          r.date,
      sourceDataset: r.source_dataset,
      snippet:       r.snippet,
      rank:          r.rank,
    }));
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  stats(): LegalDocumentStats {
    const total = (this.db.prepare(
      'SELECT COUNT(*) as n FROM LegalDocuments WHERE is_active = 1',
    ).get() as { n: number }).n;

    const publicCount = (this.db.prepare(
      "SELECT COUNT(*) as n FROM LegalDocuments WHERE is_active = 1 AND visibility_scope = 'PUBLIC'",
    ).get() as { n: number }).n;

    const bySource = this.db.prepare(
      `SELECT source_dataset as source, COUNT(*) as count FROM LegalDocuments
       WHERE is_active = 1 GROUP BY source_dataset ORDER BY count DESC`,
    ).all() as Array<{ source: string; count: number }>;

    const byDocumentType = this.db.prepare(
      `SELECT document_type as type, COUNT(*) as count FROM LegalDocuments
       WHERE is_active = 1 GROUP BY document_type ORDER BY count DESC`,
    ).all() as Array<{ type: string; count: number }>;

    const withEmbeddings = (this.db.prepare(
      'SELECT COUNT(*) as n FROM LegalDocumentEmbeddings',
    ).get() as { n: number }).n;

    const citationCount = (this.db.prepare(
      'SELECT COUNT(*) as n FROM VerdictCitations',
    ).get() as { n: number }).n;

    return { total, publicCount, bySource, byDocumentType, withEmbeddings, citationCount };
  }

  // ── Embedding helpers ─────────────────────────────────────────────────

  documentsMissingEmbedding(limit = 100): Array<{ documentId: string; text: string }> {
    return this.db.prepare(`
      SELECT ld.document_id, ld.text FROM LegalDocuments ld
      LEFT JOIN LegalDocumentEmbeddings e ON e.document_id = ld.document_id
      WHERE ld.is_active = 1 AND ld.visibility_scope = 'PUBLIC' AND e.id IS NULL
      LIMIT ?
    `).all(limit) as Array<{ documentId: string; text: string }>;
  }

  markIndexed(documentId: string): void {
    this.db.prepare(`
      UPDATE LegalDocuments SET indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE document_id = ?
    `).run(documentId);
  }

  // ── Deletion / cleanup ────────────────────────────────────────────────

  deactivateBySource(sourceDataset: string): number {
    const result = this.db.prepare(
      "UPDATE LegalDocuments SET is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_dataset = ?",
    ).run(sourceDataset);
    return result.changes;
  }

  countBySource(sourceDataset: string): number {
    return (this.db.prepare(
      'SELECT COUNT(*) as n FROM LegalDocuments WHERE source_dataset = ? AND is_active = 1',
    ).get(sourceDataset) as { n: number }).n;
