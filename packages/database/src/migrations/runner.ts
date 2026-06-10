import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DatabaseConnection } from '../connection.js';
import { logger } from '@factum-il/shared';

interface MigrationRow {
  version: number;
  name: string;
  checksum: string;
}

/**
 * Applies pending SQL migration files from a directory in order.
 * Tracks applied migrations in the `_migrations` table.
 * Idempotent – skips already-applied migrations.
 * Fails fast if a migration checksum changes after application.
 */
export class MigrationRunner {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly migrationsDir: string,
  ) {}

  run(): void {
    this.ensureMigrationsTable();

    const applied  = this.getAppliedMigrations();
    const pending  = this.getPendingMigrations(applied);

    if (pending.length === 0) {
      logger.info('No pending migrations.', { category: 'migration', agentSource: 'DataArchitect' });
      return;
    }

    const t0 = Date.now();
    for (const file of pending) {
      this.applyMigration(file, applied);
    }
    const elapsed = Date.now() - t0;
    if (elapsed > 5_000) {
      logger.warn(
        `[migration] ${pending.length} migration(s) applied in ${elapsed}ms — a migration may be blocking startup`,
        { category: 'migration', agentSource: 'DataArchitect', elapsed, count: pending.length },
      );
    }
  }

  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        version     INTEGER NOT NULL UNIQUE,
        name        TEXT    NOT NULL,
        applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        checksum    TEXT    NOT NULL
      );
    `);
  }

  private getAppliedMigrations(): Map<number, MigrationRow> {
    const rows = this.db
      .prepare('SELECT version, name, checksum FROM _migrations ORDER BY version ASC')
      .all() as MigrationRow[];

    return new Map(rows.map((r) => [r.version, r]));
  }

  private getPendingMigrations(applied: Map<number, MigrationRow>): string[] {
    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending: string[] = [];
    for (const file of files) {
      const version = this.parseVersion(file);
      if (version === null) continue;

      if (applied.has(version)) {
        // Verify checksum has not changed
        const sql      = readFileSync(join(this.migrationsDir, file), 'utf-8');
        const checksum = this.checksum(sql);
        const row      = applied.get(version)!;
        if (row.checksum !== checksum && !row.checksum.startsWith('sha256-placeholder')) {
          throw new Error(
            `Migration checksum mismatch for ${file}. ` +
            `Expected ${row.checksum}, got ${checksum}. ` +
            'Do not modify applied migrations.',
          );
        }
        continue;
      }
      pending.push(file);
    }
    return pending;
  }

  private applyMigration(file: string, applied: Map<number, MigrationRow>): void {
    const version  = this.parseVersion(file)!;
    const filePath = join(this.migrationsDir, file);
    const sql      = readFileSync(filePath, 'utf-8');
    const checksum = this.checksum(sql);

    // If the migration declares -- SKIP_ON_ERROR on its first non-empty line,
    // failures are logged as warnings rather than crashing the app. The migration
    // is NOT recorded as applied so it is retried on every startup (useful for
    // extension-dependent virtual tables like vec0 that may not always be available).
    const skipOnError = /^\s*--\s*SKIP_ON_ERROR\b/.test(sql);

    logger.info(`Applying migration: ${file}`, {
      category: 'migration',
      agentSource: 'DataArchitect',
    });

    // SQLite forbids PRAGMA journal_mode changes inside a transaction.
    // Run PRAGMA statements first, outside the transaction.
    // Also strip explicit BEGIN/COMMIT/ROLLBACK — the runner owns the transaction.
    const pragmaLines = sql
      .split('\n')
      .filter((l) => /^\s*PRAGMA\s+/i.test(l));
    const nonPragmaSql = sql
      .split('\n')
      .filter((l) => !/^\s*PRAGMA\s+/i.test(l))
      // Only strip explicit transaction-control lines (not trigger BEGIN/END).
      // Require the TRANSACTION keyword (or DEFERRED/IMMEDIATE/EXCLUSIVE qualifier)
      // so bare "BEGIN" used as a trigger-body delimiter is preserved.
      .filter((l) => !/^\s*(BEGIN\s+(DEFERRED\s+|IMMEDIATE\s+|EXCLUSIVE\s+)?TRANSACTION|COMMIT(\s+TRANSACTION)?|ROLLBACK(\s+TRANSACTION)?)\s*;?\s*$/i.test(l))
      .join('\n');

    try {
      for (const pragma of pragmaLines) {
        const stmt = pragma.trim().replace(/;$/, '');
        if (stmt) this.db.exec(stmt);
      }
      this.db.transaction(() => {
        if (nonPragmaSql.trim()) this.db.exec(nonPragmaSql);
        this.db
          .prepare(
            "INSERT OR REPLACE INTO _migrations (version, name, checksum) VALUES (?, ?, ?)",
          )
          .run(version, file.replace('.sql', ''), checksum);
      });
    } catch (err) {
      if (skipOnError) {
        logger.warn(`Migration ${file} failed and was skipped (SKIP_ON_ERROR): ${String(err)}`, {
          category: 'migration',
          agentSource: 'DataArchitect',
        });
        return; // leave unapplied so it is retried next startup
      }
      throw err;
    }

    logger.info(`Migration applied: ${file}`, {
      category: 'migration',
      agentSource: 'DataArchitect',
    });
    applied.set(version, { version, name: file, checksum });
  }

  private parseVersion(filename: string): number | null {
    const match = filename.match(/^(\d+)_/);
    if (!match || !match[1]) return null;
    return parseInt(match[1], 10);
  }

  private checksum(sql: string): string {
    return createHash('sha256').update(sql, 'utf-8').digest('hex');
  }
}
