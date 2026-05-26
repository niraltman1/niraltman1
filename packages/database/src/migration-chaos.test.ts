import { describe, it, expect } from 'vitest';
import { DatabaseConnection } from './connection.js';
import { MigrationRunner } from './migrations/runner.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';

function makeMemoryConnection(): DatabaseConnection {
  // DatabaseConnection with :memory: skips the data_store ATTACH automatically
  return new DatabaseConnection({ path: ':memory:' });
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'factum-chaos-'));
}

// ─── Chaos C: Migration recovery ──────────────────────────────────────────────

describe('Chaos C — SKIP_ON_ERROR migration recovery', () => {
  it('preceding good migrations commit even when a SKIP_ON_ERROR migration fails', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_good.sql'),
      `CREATE TABLE GoodTable (id INTEGER PRIMARY KEY);`);
    writeFileSync(join(dir, '002_skip.sql'),
      `-- SKIP_ON_ERROR\nCREATE VIRTUAL TABLE missing_ext USING nonexistent_extension();`);
    writeFileSync(join(dir, '003_also_good.sql'),
      `CREATE TABLE AnotherGoodTable (id INTEGER PRIMARY KEY);`);

    expect(() => new MigrationRunner(db, dir).run()).not.toThrow();

    // GoodTable and AnotherGoodTable were created (migrations 001 + 003 committed)
    expect(() => db.exec('SELECT 1 FROM GoodTable')).not.toThrow();
    expect(() => db.exec('SELECT 1 FROM AnotherGoodTable')).not.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });

  it('SKIP_ON_ERROR migration is NOT recorded in _migrations (retried next run)', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_skip.sql'),
      `-- SKIP_ON_ERROR\nCREATE VIRTUAL TABLE will_fail USING ghost_extension();`);

    new MigrationRunner(db, dir).run();

    const rows = db.prepare('SELECT * FROM _migrations WHERE version = 1').all();
    expect(rows).toHaveLength(0); // not recorded — will retry

    rmSync(dir, { recursive: true, force: true });
  });

  it('SKIP_ON_ERROR migration is retried on every runner.run() call', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_skip.sql'),
      `-- SKIP_ON_ERROR\nCREATE VIRTUAL TABLE always_fails USING nonexistent();`);

    const runner = new MigrationRunner(db, dir);
    runner.run();
    runner.run();
    runner.run();

    const rows = db.prepare('SELECT * FROM _migrations').all();
    expect(rows).toHaveLength(0); // still not recorded after 3 attempts

    rmSync(dir, { recursive: true, force: true });
  });

  it('non-SKIP_ON_ERROR migration throws and halts the runner', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_normal.sql'),
      `CREATE TABLE ShouldExist (id INTEGER PRIMARY KEY);`);
    // SQLite will throw on a reference to a non-existent table in this way
    writeFileSync(join(dir, '002_bad.sql'),
      `INSERT INTO TableThatDoesNotExistAtAll (id) VALUES (1);`);

    expect(() => new MigrationRunner(db, dir).run()).toThrow();

    rmSync(dir, { recursive: true, force: true });
  });

  it('DB integrity is ok after a failed non-SKIP_ON_ERROR migration', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_good.sql'),
      `CREATE TABLE SafeTable (id INTEGER PRIMARY KEY);`);
    writeFileSync(join(dir, '002_crash.sql'),
      `INSERT INTO AbsolutelyNoSuchTable (id) VALUES (1);`);

    try { new MigrationRunner(db, dir).run(); } catch { /* expected */ }

    const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    expect(integrity).toBe('ok');

    rmSync(dir, { recursive: true, force: true });
  });

  it('good migrations before crash are committed and accessible', () => {
    const db  = makeMemoryConnection();
    const dir = makeTempDir();

    writeFileSync(join(dir, '001_committed.sql'),
      `CREATE TABLE CommittedTable (id INTEGER PRIMARY KEY);\nINSERT INTO CommittedTable VALUES (42);`);
    writeFileSync(join(dir, '002_crash.sql'),
      `INSERT INTO AbsolutelyNoSuchTable (id) VALUES (1);`);

    try { new MigrationRunner(db, dir).run(); } catch { /* expected */ }

    const row = db.prepare('SELECT id FROM CommittedTable').get() as { id: number } | undefined;
    expect(row?.id).toBe(42);

    rmSync(dir, { recursive: true, force: true });
  });
});
