import type { LegalEntity, EntityKind } from './types.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

interface EntityRow {
  id: number;
  kind: string;
  canonical: string;
  aliases: string;
  case_id: number | null;
  document_id: number | null;
}

function rowToEntity(row: EntityRow): LegalEntity {
  return {
    id:         row.id,
    kind:       row.kind as EntityKind,
    canonical:  row.canonical,
    aliases:    JSON.parse(row.aliases) as string[],
    caseId:     row.case_id,
    documentId: row.document_id,
  };
}

export function findEntityByAlias(
  alias: string,
  kind: EntityKind,
  db: DbHandle,
): LegalEntity | null {
  const row = db.prepare(
    `SELECT * FROM Entities WHERE kind = ? AND (canonical = ? OR aliases LIKE ?)`,
  ).get(kind, alias, `%"${alias}"%`) as EntityRow | undefined;
  return row ? rowToEntity(row) : null;
}

export function getRelatedEntities(entityId: number, db: DbHandle): LegalEntity[] {
  return (db.prepare(`
    SELECT e.* FROM Entities e
    JOIN EntityRelations r ON (r.from_id = ? AND r.to_id = e.id)
                           OR (r.to_id = ? AND r.from_id = e.id)
  `).all(entityId, entityId) as EntityRow[]).map(rowToEntity);
}

export function upsertEntity(
  entity: Omit<LegalEntity, 'id'>,
  db: DbHandle,
): number {
  db.prepare(`
    INSERT INTO Entities (kind, canonical, aliases, case_id, document_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(kind, canonical) DO UPDATE SET
      aliases = excluded.aliases,
      case_id = COALESCE(excluded.case_id, case_id),
      document_id = COALESCE(excluded.document_id, document_id)
  `).run(
    entity.kind,
    entity.canonical,
    JSON.stringify(entity.aliases),
    entity.caseId ?? null,
    entity.documentId ?? null,
  );
  const row = db.prepare(
    `SELECT id FROM Entities WHERE kind = ? AND canonical = ?`,
  ).get(entity.kind, entity.canonical) as { id: number } | undefined;
  return row?.id ?? 0;
}
