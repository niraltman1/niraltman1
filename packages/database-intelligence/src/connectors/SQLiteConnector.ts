/**
 * SQLiteConnector — read-only scan of an external SQLite file.
 * Opens the database in read-only mode; never writes.
 */

import { statSync, existsSync } from 'node:fs';
import type { DataSourceConnector, ConnectionTestResult } from './DataSourceConnector.js';
import type { DatabaseSchemaSnapshot, TableInfo, ColumnInfo } from '../types.js';

const MAX_SAMPLE_ROWS = 3;
const MAX_TABLES      = 200;

export class SQLiteConnector implements DataSourceConnector {
  constructor(private readonly filePath: string) {}

  async testConnection(): Promise<ConnectionTestResult> {
    if (!existsSync(this.filePath)) {
      return { success: false, detail: `File not found: ${this.filePath}`, kind: 'sqlite' };
    }
    const ext = this.filePath.toLowerCase();
    if (!ext.endsWith('.db') && !ext.endsWith('.sqlite') && !ext.endsWith('.sqlite3')) {
      return { success: false, detail: 'File extension is not .db / .sqlite / .sqlite3', kind: 'unknown' };
    }
    try {
      statSync(this.filePath);
      return { success: true, detail: 'File accessible', kind: 'sqlite' };
    } catch (e) {
      return { success: false, detail: String(e), kind: 'sqlite' };
    }
  }

  async scan(): Promise<DatabaseSchemaSnapshot> {
    // Dynamic import so the server doesn't need better-sqlite3 as a hard dep
    // if it's not installed; fails gracefully with an empty snapshot.
    let Database: (new (path: string, opts: { readonly: boolean }) => unknown) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import('better-sqlite3' as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Database = (mod as { default: typeof Database }).default ?? mod;
    } catch {
      return this.emptySnapshot('better-sqlite3 not available');
    }

    const stat   = statSync(this.filePath);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const db     = new (Database as new (p: string, o: { readonly: boolean }) => SyncDB)(this.filePath, { readonly: true });
    const tables = this.listTables(db);
    let totalRows = 0;

    const tableInfos: TableInfo[] = [];
    for (const tbl of tables.slice(0, MAX_TABLES)) {
      const info = this.scanTable(db, tbl);
      totalRows += info.rowCount;
      tableInfos.push(info);
    }

    (db as unknown as { close(): void }).close();

    return {
      sourceType:   'sqlite',
      sourcePath:   this.filePath,
      scannedAt:    new Date().toISOString(),
      tables:       tableInfos,
      totalRows,
      fileSizeBytes: stat.size,
    };
  }

  private listTables(db: SyncDB): string[] {
    type Row = { name: string };
    return (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as Row[]).map((r) => r.name);
  }

  private scanTable(db: SyncDB, name: string): TableInfo {
    // Row count
    let rowCount = 0;
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number } | undefined;
      rowCount = row?.n ?? 0;
    } catch { /* skip */ }

    // Columns via PRAGMA
    type PragmaRow = { name: string; type: string; notnull: number; pk: number; dflt_value: string | null };
    let columns: ColumnInfo[] = [];
    try {
      const rows = db.prepare(`PRAGMA table_info("${name}")`).all() as PragmaRow[];
      columns = rows.map((r) => ({
        name:         r.name,
        type:         r.type || 'TEXT',
        nullable:     r.notnull === 0,
        primaryKey:   r.pk > 0,
        defaultValue: r.dflt_value,
      }));
    } catch { /* skip */ }

    // Sample rows
    let sampleRows: Record<string, unknown>[] = [];
    try {
      sampleRows = db.prepare(`SELECT * FROM "${name}" LIMIT ${MAX_SAMPLE_ROWS}`).all() as Record<string, unknown>[];
    } catch { /* skip */ }

    return { name, rowCount, columns, sampleRows };
  }

  private emptySnapshot(reason: string): DatabaseSchemaSnapshot {
    return {
      sourceType:    'sqlite',
      sourcePath:    this.filePath,
      scannedAt:     new Date().toISOString(),
      tables:        [],
      totalRows:     0,
      fileSizeBytes: 0,
      ...(reason ? {} : {}),
    };
  }
}

interface SyncDB {
  prepare(sql: string): { all(): unknown[]; get(): unknown };
  close(): void;
}
