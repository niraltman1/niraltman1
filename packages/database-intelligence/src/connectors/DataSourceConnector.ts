// DataSourceConnector — interface all connectors implement

import type { DatabaseSchemaSnapshot } from '../types.js';

export interface ConnectionTestResult {
  success:  boolean;
  detail:   string;
  /** Detected source type */
  kind:     'sqlite' | 'csv' | 'excel' | 'unknown';
}

export interface DataSourceConnector {
  /** Quick connectivity / file-exists check — never reads full data */
  testConnection(): Promise<ConnectionTestResult>;
  /** Full read-only scan → schema snapshot */
  scan(): Promise<DatabaseSchemaSnapshot>;
}
