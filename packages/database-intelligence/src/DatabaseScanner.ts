/**
 * DatabaseScanner — orchestrates connectors to produce a DatabaseSchemaSnapshot.
 * Auto-detects source type from path extension when connector isn't supplied.
 */

import { extname } from 'node:path';
import type { DataSourceConnector } from './connectors/DataSourceConnector.js';
import { SQLiteConnector }  from './connectors/SQLiteConnector.js';
import { CSVConnector }     from './connectors/CSVConnector.js';
import { ExcelConnector }   from './connectors/ExcelConnector.js';
import type { DatabaseSchemaSnapshot } from './types.js';

export type ScanInput =
  | { type: 'sqlite'; path: string }
  | { type: 'csv';    path: string }
  | { type: 'excel';  path: string }
  | { connector: DataSourceConnector };

export class DatabaseScanner {
  private readonly connector: DataSourceConnector;

  constructor(input: ScanInput) {
    if ('connector' in input) {
      this.connector = input.connector;
    } else {
      this.connector = DatabaseScanner.makeConnector(input.type, input.path);
    }
  }

  static autoDetect(path: string): DatabaseScanner {
    const ext = extname(path).toLowerCase();
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      return new DatabaseScanner({ type: 'sqlite', path });
    }
    if (ext === '.xlsx' || ext === '.xls') {
      return new DatabaseScanner({ type: 'excel', path });
    }
    // Treat as CSV folder by default
    return new DatabaseScanner({ type: 'csv', path });
  }

  async testConnection() {
    return this.connector.testConnection();
  }

  async scan(): Promise<DatabaseSchemaSnapshot> {
    return this.connector.scan();
  }

  private static makeConnector(type: 'sqlite' | 'csv' | 'excel', path: string): DataSourceConnector {
    if (type === 'sqlite') return new SQLiteConnector(path);
    if (type === 'csv')    return new CSVConnector(path);
    return new ExcelConnector(path);
  }
}
