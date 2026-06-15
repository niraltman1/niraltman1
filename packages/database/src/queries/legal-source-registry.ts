import type { DatabaseConnection } from '../connection.js';

export type UpdateStrategy = 'REPLACE' | 'MERGE' | 'APPEND';
export type RegistrySourceType = 'CASE_LAW' | 'LEGISLATION' | 'REGULATION' | 'GUIDELINE';

export interface LegalSourceRegistryRow {
  readonly id:               number;
  readonly sourceId:         string;
  readonly sourceName:       string;
  readonly sourceVersion:    string | null;
  readonly sourceLicense:    string | null;
  readonly sourceType:       RegistrySourceType;
  readonly updateStrategy:   UpdateStrategy;
  readonly ingestionAdapter: string;
  readonly description:      string | null;
  readonly homeUrl:          string | null;
  readonly isActive:         boolean;
  readonly lastIngestedAt:   string | null;
  readonly documentCount:    number;
  readonly createdAt:        string;
  readonly updatedAt:        string;
}

export interface UpsertSourceInput {
  sourceId:         string;
  sourceName:       string;
  sourceVersion?:   string | null;
  sourceLicense?:   string | null;
  sourceType:       RegistrySourceType;
  updateStrategy?:  UpdateStrategy;
  ingestionAdapter: string;
  description?:     string | null;
  homeUrl?:         string | null;
}

interface RawRow {
  id: number; source_id: string; source_name: string; source_version: string | null;
  source_license: string | null; source_type: string; update_strategy: string;
  ingestion_adapter: string; description: string | null; home_url: string | null;
  is_active: number; last_ingested_at: string | null; document_count: number;
  created_at: string; updated_at: string;
}

function toRow(r: RawRow): LegalSourceRegistryRow {
  return {
    id:               r.id,
    sourceId:         r.source_id,
    sourceName:       r.source_name,
    sourceVersion:    r.source_version,
    sourceLicense:    r.source_license,
    sourceType:       r.source_type as RegistrySourceType,
    updateStrategy:   r.update_strategy as UpdateStrategy,
    ingestionAdapter: r.ingestion_adapter,
    description:      r.description,
    homeUrl:          r.home_url,
    isActive:         r.is_active === 1,
    lastIngestedAt:   r.last_ingested_at,
    documentCount:    r.document_count,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

export class LegalSourceRegistryRepository {
  constructor(private readonly db: DatabaseConnection) {}

  upsert(input: UpsertSourceInput): LegalSourceRegistryRow {
    this.db.prepare(`
      INSERT INTO LegalSourceRegistry
        (source_id, source_name, source_version, source_license, source_type,
         update_strategy, ingestion_adapter, description, home_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        source_name       = excluded.source_name,
        source_version    = excluded.source_version,
        source_license    = excluded.source_license,
        source_type       = excluded.source_type,
        update_strategy   = excluded.update_strategy,
        ingestion_adapter = excluded.ingestion_adapter,
        description       = excluded.description,
        home_url          = excluded.home_url,
        updated_at        = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(
      input.sourceId, input.sourceName, input.sourceVersion ?? null,
      input.sourceLicense ?? null, input.sourceType,
      input.updateStrategy ?? 'REPLACE', input.ingestionAdapter,
      input.description ?? null, input.homeUrl ?? null,
    );
    return this.getBySourceId(input.sourceId)!;
  }

  getBySourceId(sourceId: string): LegalSourceRegistryRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalSourceRegistry WHERE source_id = ?',
    ).get(sourceId) as RawRow | undefined;
    return raw ? toRow(raw) : null;
  }

  getById(id: number): LegalSourceRegistryRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalSourceRegistry WHERE id = ?',
    ).get(id) as RawRow | undefined;
    return raw ? toRow(raw) : null;
  }

  list(activeOnly = true): LegalSourceRegistryRow[] {
    const rows = this.db.prepare(
      activeOnly
        ? 'SELECT * FROM LegalSourceRegistry WHERE is_active = 1 ORDER BY source_type, source_name'
        : 'SELECT * FROM LegalSourceRegistry ORDER BY source_type, source_name',
    ).all() as RawRow[];
    return rows.map(toRow);
  }

  markIngested(sourceId: string, documentCount: number): void {
    this.db.prepare(`
      UPDATE LegalSourceRegistry SET
        last_ingested_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        document_count   = ?,
        updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE source_id = ?
    `).run(documentCount, sourceId);
  }

  setActive(sourceId: string, active: boolean): void {
    this.db.prepare(
      "UPDATE LegalSourceRegistry SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE source_id = ?",
    ).run(active ? 1 : 0, sourceId);
  }
}
