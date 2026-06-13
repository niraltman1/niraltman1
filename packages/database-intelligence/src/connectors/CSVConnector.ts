/**
 * CSVConnector — scans a folder of .csv files, infers schema from headers.
 * Read-only; never writes or modifies files.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { DataSourceConnector, ConnectionTestResult } from './DataSourceConnector.js';
import type { DatabaseSchemaSnapshot, TableInfo, ColumnInfo } from '../types.js';

const MAX_SAMPLE_ROWS = 3;

export class CSVConnector implements DataSourceConnector {
  constructor(private readonly folderPath: string) {}

  async testConnection(): Promise<ConnectionTestResult> {
    if (!existsSync(this.folderPath)) {
      return { success: false, detail: `Folder not found: ${this.folderPath}`, kind: 'csv' };
    }
    try {
      const files = readdirSync(this.folderPath).filter((f) => extname(f).toLowerCase() === '.csv');
      if (files.length === 0) {
        return { success: false, detail: 'No .csv files found in folder', kind: 'csv' };
      }
      return { success: true, detail: `Found ${files.length} CSV file(s)`, kind: 'csv' };
    } catch (e) {
      return { success: false, detail: String(e), kind: 'csv' };
    }
  }

  async scan(): Promise<DatabaseSchemaSnapshot> {
    const csvFiles = readdirSync(this.folderPath)
      .filter((f) => extname(f).toLowerCase() === '.csv')
      .sort();

    let totalRows = 0;
    let totalSize = 0;
    const tables: TableInfo[] = [];

    for (const file of csvFiles) {
      const filePath = join(this.folderPath, file);
      const info     = this.scanCsvFile(filePath, file);
      totalRows     += info.rowCount;
      totalSize     += statSync(filePath).size;
      tables.push(info);
    }

    return {
      sourceType:    'csv',
      sourcePath:    this.folderPath,
      scannedAt:     new Date().toISOString(),
      tables,
      totalRows,
      fileSizeBytes: totalSize,
    };
  }

  private scanCsvFile(filePath: string, filename: string): TableInfo {
    const tableName = basename(filename, extname(filename));
    try {
      const content  = readFileSync(filePath, 'utf8');
      const lines    = content.split('\n').filter(Boolean);
      if (lines.length === 0) return { name: tableName, rowCount: 0, columns: [], sampleRows: [] };

      const headers  = this.parseCsvLine(lines[0] ?? '');
      const rowCount = Math.max(0, lines.length - 1);

      const columns: ColumnInfo[] = headers.map((h) => ({
        name:         h.trim(),
        type:         'TEXT',
        nullable:     true,
        primaryKey:   false,
        defaultValue: null,
      }));

      const sampleRows: Record<string, unknown>[] = [];
      for (let i = 1; i <= Math.min(MAX_SAMPLE_ROWS, rowCount); i++) {
        const values = this.parseCsvLine(lines[i] ?? '');
        const row: Record<string, unknown> = {};
        headers.forEach((h, idx) => { row[h.trim()] = values[idx] ?? ''; });
        sampleRows.push(row);
      }

      return { name: tableName, rowCount, columns, sampleRows };
    } catch {
      return { name: tableName, rowCount: 0, columns: [], sampleRows: [] };
    }
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current  = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }
}
