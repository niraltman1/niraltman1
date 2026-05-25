import Database from 'better-sqlite3';
import type { Database as BetterSQLite3Database, Statement } from 'better-sqlite3';
import { logger } from '@factum-il/shared';

export interface DatabaseConfig {
  readonly path: string;
  readonly readonly?: boolean;
}

/**
 * Manages a single better-sqlite3 connection with WAL mode and foreign keys.
 * Designed for synchronous use – better-sqlite3 is synchronous by design.
 */
export class DatabaseConnection {
  private readonly db: BetterSQLite3Database;

  constructor(config: DatabaseConfig) {
    this.db = new Database(config.path, {
      readonly: config.readonly ?? false,
      fileMustExist: false,
    });

    // Apply mandatory pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 30000'); // 30s wait before "database is locked"
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('encoding = "UTF-8"');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -32000');  // 32 MB cache
    this.db.pragma('auto_vacuum = INCREMENTAL');

    // Attach the heavy-data store (DocumentChunks, ChunkEmbeddings, OCR outputs).
    // Skipped for :memory: databases used in tests and for read-only connections.
    // The attached schema alias is `data_store`; tables not yet migrated there
    // continue to resolve from the main schema transparently.
    if (config.path !== ':memory:' && !(config.readonly ?? false)) {
      const dataPath = config.path.replace(/\.db$/, '_data.db');
      try {
        this.db.exec(`ATTACH DATABASE '${dataPath}' AS data_store`);
      } catch (err) {
        logger.warn(`Failed to attach data_store at ${dataPath}: ${String(err)}`, {
          category: 'system',
          agentSource: 'DataArchitect',
        });
      }
    }

    logger.info('Database connection established', {
      category: 'system',
      agentSource: 'DataArchitect',
    });
  }

  get raw(): BetterSQLite3Database {
    return this.db;
  }

  /**
   * Executes a function inside a serialisable transaction.
   * Rolls back automatically on exception.
   */
  transaction<T>(fn: () => T): T {
    const tx = this.db.transaction(fn);
    return tx();
  }

  /**
   * Executes a raw SQL string.  Use only for DDL or trusted internal SQL.
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Statement<unknown[]> {
    return this.db.prepare(sql) as Statement<unknown[]>;
  }

  close(): void {
    this.db.close();
    logger.info('Database connection closed', { category: 'system', agentSource: 'DataArchitect' });
  }
}
