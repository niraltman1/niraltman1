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

    for (const file of pending) {
      this.applyMigration(file, applied);
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

    logger.info(`Applying migration: ${file}`, {
      category: 'migration',
      agentSource: 'DataArchitect',
    });

    this.db.transaction(() => {
      this.db.exec(sql);
      this.db
        .prepare(
          "INSERT OR REPLACE INTO _migrations (version, name, checksum) VALUES (?, ?, ?)",
        )
        .run(version, file.replace('.sql', ''), checksum);
    });

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
