/**
 * ExcelConnector — scans an .xlsx workbook; each sheet becomes a "table".
 * Uses the xlsx package (SheetJS) if available; degrades gracefully if not.
 * Read-only; never writes.
 */

import { statSync, existsSync } from 'node:fs';
import type { DataSourceConnector, ConnectionTestResult } from './DataSourceConnector.js';
import type { DatabaseSchemaSnapshot, TableInfo, ColumnInfo } from '../types.js';

const MAX_SAMPLE_ROWS = 3;

export class ExcelConnector implements DataSourceConnector {
  constructor(private readonly filePath: string) {}

  async testConnection(): Promise<ConnectionTestResult> {
    if (!existsSync(this.filePath)) {
      return { success: false, detail: `File not found: ${this.filePath}`, kind: 'excel' };
    }
    const ext = this.filePath.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      return { success: false, detail: 'File extension must be .xlsx or .xls', kind: 'unknown' };
    }
    return { success: true, detail: 'File accessible', kind: 'excel' };
  }

  async scan(): Promise<DatabaseSchemaSnapshot> {
    const stat = statSync(this.filePath);

    // Dynamic import: xlsx (SheetJS) — optional dep
    let XLSX: XLSXModule | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import('xlsx' as string);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      XLSX = ((mod as { default?: XLSXModule }).default ?? mod) as XLSXModule;
    } catch {
      return {
        sourceType: 'excel', sourcePath: this.filePath,
        scannedAt: new Date().toISOString(), tables: [], totalRows: 0,
        fileSizeBytes: stat.size,
      };
    }

    const workbook = XLSX.readFile(this.filePath, { type: 'file', cellDates: true });
    let totalRows  = 0;
    const tables: TableInfo[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const headers = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];

      const columns: ColumnInfo[] = headers.map((h) => ({
        name:         String(h),
        type:         'TEXT',
        nullable:     true,
        primaryKey:   false,
        defaultValue: null,
      }));

      const sampleRows = rows.slice(0, MAX_SAMPLE_ROWS);
      totalRows += rows.length;

      tables.push({ name: sheetName, rowCount: rows.length, columns, sampleRows });
    }

    return {
      sourceType:    'excel',
      sourcePath:    this.filePath,
      scannedAt:     new Date().toISOString(),
      tables,
      totalRows,
      fileSizeBytes: stat.size,
    };
  }
}

interface XLSXModule {
  readFile(path: string, opts?: { type?: string; cellDates?: boolean }): XLSXWorkbook;
  utils: {
    sheet_to_json<T>(sheet: unknown, opts?: { defval?: unknown }): T[];
  };
}

interface XLSXWorkbook {
  SheetNames: string[];
  Sheets:     Record<string, unknown>;
}
