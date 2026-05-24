import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseConnection } from './connection.js';
import { MigrationRunner } from './migrations/runner.js';

// ---------------------------------------------------------------------------
// Group 1: DatabaseConnection basics
// ---------------------------------------------------------------------------
describe('DatabaseConnection', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  it('constructs without error', () => {
    expect(db).toBeInstanceOf(DatabaseConnection);
  });

  it('sets WAL or memory journal_mode pragma', () => {
    // In-memory DBs may return "memory" instead of "wal" depending on SQLite version
    const mode = db.raw.pragma('journal_mode', { simple: true }) as string;
    expect(['wal', 'memory']).toContain(mode);
  });

  it('sets foreign_keys ON', () => {
    const fk = db.raw.pragma('foreign_keys', { simple: true }) as number;
    expect(fk).toBe(1);
  });

  it('exec() runs DDL without throwing', () => {
    expect(() =>
      db.exec('CREATE TABLE test_exec (id INTEGER PRIMARY KEY, name TEXT NOT NULL)'),
    ).not.toThrow();
  });

  it('prepare() returns a statement that can execute a SELECT', () => {
    db.exec('CREATE TABLE test_select (id INTEGER PRIMARY KEY, val TEXT)');
    db.prepare('INSERT INTO test_select (val) VALUES (?)').run('hello');
    const row = db.prepare('SELECT val FROM test_select WHERE id = 1').get() as
      | { val: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.val).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Group 2: DatabaseConnection.transaction()
// ---------------------------------------------------------------------------
describe('DatabaseConnection.transaction()', () => {
  let db: DatabaseConnection;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  });

  afterEach(() => {
    db.close();
  });

  it('commits changes on success', () => {
    db.transaction(() => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('committed');
    });
    const row = db.prepare('SELECT name FROM items WHERE name = ?').get('committed') as
      | { name: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('committed');
  });

  it('rolls back on exception and re-throws the error', () => {
    expect(() => {
      db.transaction(() => {
        db.prepare('INSERT INTO items (name) VALUES (?)').run('rolled-back');
        throw new Error('intentional rollback');
      });
    }).toThrow('intentional rollback');

    const row = db.prepare('SELECT name FROM items WHERE name = ?').get('rolled-back') as
      | { name: string }
      | undefined;
    expect(row).toBeUndefined();
  });

  it('commits outer changes in nested transaction scenario', () => {
    db.transaction(() => {
      db.prepare('INSERT INTO items (name) VALUES (?)').run('outer');
      // Nested transactions are savepoints in better-sqlite3; outer commits
      db.transaction(() => {
        db.prepare('INSERT INTO items (name) VALUES (?)').run('inner');
      });
    });
    const rows = db.prepare('SELECT name FROM items').all() as Array<{ name: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toContain('outer');
    expect(rows.map((r) => r.name)).toContain('inner');
  });
});

// ---------------------------------------------------------------------------
// Group 3: MigrationRunner
// ---------------------------------------------------------------------------
describe('MigrationRunner', () => {
  let db: DatabaseConnection;
  let tmpMigrDir: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    tmpMigrDir = mkdtempSync(join(tmpdir(), 'migrations-'));
  });

  afterEach(() => {
    db.close();
  });

  it('fresh DB with 0 migration files runs without error', () => {
    const runner = new MigrationRunner(db, tmpMigrDir);
    expect(() => runner.run()).not.toThrow();
  });

  it('applies two migration files in order and creates both tables', () => {
    writeFileSync(
      join(tmpMigrDir, '001_foo.sql'),
      'CREATE TABLE foo (id INTEGER PRIMARY KEY);',
    );
    writeFileSync(
      join(tmpMigrDir, '002_bar.sql'),
      'CREATE TABLE bar (id INTEGER PRIMARY KEY);',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run();

    // Both tables must exist
    const fooRow = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='foo'")
      .get() as { name: string } | undefined;
    const barRow = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bar'")
      .get() as { name: string } | undefined;

    expect(fooRow?.name).toBe('foo');
    expect(barRow?.name).toBe('bar');
  });

  it('is idempotent — running twice does not throw and tables still exist', () => {
    writeFileSync(
      join(tmpMigrDir, '001_foo.sql'),
      'CREATE TABLE foo (id INTEGER PRIMARY KEY);',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run();
    expect(() => runner.run()).not.toThrow();

    const fooRow = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='foo'")
      .get() as { name: string } | undefined;
    expect(fooRow?.name).toBe('foo');
  });

  it('throws on checksum mismatch after migration was already applied', () => {
    const migPath = join(tmpMigrDir, '001_foo.sql');
    writeFileSync(migPath, 'CREATE TABLE foo (id INTEGER PRIMARY KEY);');

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run(); // apply once

    // Overwrite content — different SQL, different checksum
    writeFileSync(migPath, 'CREATE TABLE foo_altered (id INTEGER PRIMARY KEY);');

    expect(() => runner.run()).toThrow(/checksum mismatch/i);
  });

  it('silently skips files without a numeric prefix', () => {
    writeFileSync(
      join(tmpMigrDir, 'invalid_name.sql'),
      'CREATE TABLE should_not_exist (id INTEGER PRIMARY KEY);',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    expect(() => runner.run()).not.toThrow();

    const row = db.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='should_not_exist'",
      )
      .get() as { name: string } | undefined;
    expect(row).toBeUndefined();
  });

  it('parses version numbers correctly from filenames', () => {
    // 001 → 1, 010 → 10, 099 → 99
    writeFileSync(
      join(tmpMigrDir, '001_alpha.sql'),
      'CREATE TABLE alpha (id INTEGER PRIMARY KEY);',
    );
    writeFileSync(
      join(tmpMigrDir, '010_beta.sql'),
      'CREATE TABLE beta (id INTEGER PRIMARY KEY);',
    );
    writeFileSync(
      join(tmpMigrDir, '099_gamma.sql'),
      'CREATE TABLE gamma (id INTEGER PRIMARY KEY);',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run();

    const rows = db.raw
      .prepare('SELECT version FROM _migrations ORDER BY version ASC')
      .all() as Array<{ version: number }>;

    expect(rows.map((r) => r.version)).toEqual([1, 10, 99]);
  });
});

// ---------------------------------------------------------------------------
// Group 4: MigrationRunner — SKIP_ON_ERROR pragma
// ---------------------------------------------------------------------------
describe('MigrationRunner — SKIP_ON_ERROR', () => {
  let db: DatabaseConnection;
  let tmpMigrDir: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    tmpMigrDir = mkdtempSync(join(tmpdir(), 'migrations-skip-'));
  });

  afterEach(() => {
    db.close();
  });

  it('does not throw when a SKIP_ON_ERROR migration fails', () => {
    writeFileSync(
      join(tmpMigrDir, '001_good.sql'),
      'CREATE TABLE good_table (id INTEGER PRIMARY KEY);',
    );
    // Intentionally invalid SQL with SKIP_ON_ERROR
    writeFileSync(
      join(tmpMigrDir, '002_bad.sql'),
      '-- SKIP_ON_ERROR\nCREATE VIRTUAL TABLE noext USING nonexistent_extension(x);',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    expect(() => runner.run()).not.toThrow();
  });

  it('still applies a preceding good migration when a SKIP_ON_ERROR one fails', () => {
    writeFileSync(
      join(tmpMigrDir, '001_good.sql'),
      'CREATE TABLE good_table (id INTEGER PRIMARY KEY);',
    );
    writeFileSync(
      join(tmpMigrDir, '002_bad.sql'),
      '-- SKIP_ON_ERROR\nINVALID SQL HERE;',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run();

    const row = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='good_table'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('good_table');
  });

  it('retries a SKIP_ON_ERROR migration on every run (does NOT record as applied)', () => {
    writeFileSync(
      join(tmpMigrDir, '001_retryable.sql'),
      '-- SKIP_ON_ERROR\nINVALID SQL;',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    runner.run();
    runner.run(); // second run must also not throw

    const applied = db.raw
      .prepare('SELECT version FROM _migrations WHERE version = 1')
      .get() as { version: number } | undefined;
    expect(applied).toBeUndefined(); // was never recorded because it always failed
  });

  it('does throw for a failing migration WITHOUT SKIP_ON_ERROR', () => {
    writeFileSync(
      join(tmpMigrDir, '001_hard_fail.sql'),
      'INVALID SQL THAT WILL FAIL;',
    );

    const runner = new MigrationRunner(db, tmpMigrDir);
    expect(() => runner.run()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Group 5: DatabaseConnection.close()
// ---------------------------------------------------------------------------
describe('DatabaseConnection.close()', () => {
  it('throws when exec() is called after close()', () => {
    const db = new DatabaseConnection({ path: ':memory:' });
    db.close();
    expect(() => db.exec('SELECT 1')).toThrow();
  });
});
