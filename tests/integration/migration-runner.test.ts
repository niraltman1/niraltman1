import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Integration test for the MigrationRunner.
 * Creates a temporary SQLite database and runs the migrations directory.
 *
 * Requires better-sqlite3 to be installed.
 */

const TMP_DIR = join(tmpdir(), `factum_il_migration_test_${Date.now()}`);
const DB_PATH = join(TMP_DIR, 'test.db');
const MIGRATIONS_DIR = join(TMP_DIR, 'migrations');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(MIGRATIONS_DIR, { recursive: true });

  writeFileSync(
    join(MIGRATIONS_DIR, '001_test.sql'),
    `
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      checksum TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS TestTable (id INTEGER PRIMARY KEY, value TEXT);
    INSERT OR IGNORE INTO _migrations (version, name, checksum) VALUES (1, '001_test', 'test-checksum-1');
    `,
    'utf-8',
  );
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('MigrationRunner', () => {
  it('applies a migration and creates the expected table', async () => {
    const { DatabaseConnection } = await import('../../packages/database/src/connection.js');
    const { MigrationRunner }    = await import('../../packages/database/src/migrations/runner.js');

    const db     = new DatabaseConnection({ path: DB_PATH });
    const runner = new MigrationRunner(db, MIGRATIONS_DIR);

    expect(() => runner.run()).not.toThrow();

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('TestTable');
    expect(tableNames).toContain('_migrations');

    db.close();
  });

  it('is idempotent – running twice does not duplicate entries', async () => {
    const { DatabaseConnection } = await import('../../packages/database/src/connection.js');
    const { MigrationRunner }    = await import('../../packages/database/src/migrations/runner.js');

    const db     = new DatabaseConnection({ path: DB_PATH });
    const runner = new MigrationRunner(db, MIGRATIONS_DIR);

    expect(() => runner.run()).not.toThrow();

    const count = (
      db.prepare('SELECT COUNT(*) as c FROM _migrations').get() as { c: number }
    ).c;
    expect(count).toBe(1);

    db.close();
  });
});
