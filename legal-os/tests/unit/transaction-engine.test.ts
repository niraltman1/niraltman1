import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ManifestTransactionEngine } from '../../packages/pipeline/src/transaction.js';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, tmpdir } from 'node:path';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS TransactionJournal (
      transaction_id TEXT PRIMARY KEY,
      document_id    INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      path_before    TEXT,
      path_after     TEXT,
      state_before   TEXT,
      state_after    TEXT,
      phase          TEXT NOT NULL DEFAULT 'BEGIN' CHECK(phase IN ('BEGIN','COMMIT','ROLLBACK','INTERRUPTED')),
      interrupted    INTEGER NOT NULL DEFAULT 0,
      replayed       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ManifestSnapshots (
      snapshot_id  TEXT PRIMARY KEY,
      document_id  INTEGER NOT NULL,
      snapshot_at  TEXT NOT NULL DEFAULT (datetime('now')),
      payload_json TEXT NOT NULL,
      file_hash    TEXT NOT NULL,
      mtime_epoch  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS Documents (
      id             INTEGER PRIMARY KEY,
      filename       TEXT NOT NULL,
      original_path  TEXT NOT NULL,
      file_hash      TEXT,
      processing_state TEXT NOT NULL DEFAULT 'DISCOVERED',
      ocr_text       TEXT,
      document_type  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(`INSERT INTO Documents (id, filename, original_path, file_hash)
              VALUES (1, 'test.pdf', '/tmp/test.pdf', 'abc123')`).run();
  return db;
}

describe('ManifestTransactionEngine', () => {
  let db: Database.Database;
  let engine: ManifestTransactionEngine;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    engine = new ManifestTransactionEngine(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'legal-os-tx-test-'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('begins a transaction and inserts a BEGIN journal entry', () => {
    const txId = engine.begin(1, 'MOVE', '/old/path.pdf', '/new/path.pdf', 'DISCOVERED');
    expect(typeof txId).toBe('string');

    const row = db.prepare('SELECT phase FROM TransactionJournal WHERE transaction_id = ?')
                  .get(txId) as { phase: string };
    expect(row.phase).toBe('BEGIN');
  });

  it('commits a transaction and updates phase to COMMIT', () => {
    const txId = engine.begin(1, 'MOVE', '/old/path.pdf', '/new/path.pdf', 'DISCOVERED');
    engine.commit(txId, 'HASHED');

    const row = db.prepare('SELECT phase, state_after FROM TransactionJournal WHERE transaction_id = ?')
                  .get(txId) as { phase: string; state_after: string };
    expect(row.phase).toBe('COMMIT');
    expect(row.state_after).toBe('HASHED');
  });

  it('rollback restores file and marks phase ROLLBACK', () => {
    const srcPath = join(tmpDir, 'source.txt');
    const dstPath = join(tmpDir, 'dest.txt');
    writeFileSync(srcPath, 'original content');
    writeFileSync(dstPath, 'moved content');

    const txId = engine.begin(1, 'MOVE', srcPath, dstPath, 'DISCOVERED');
    // Perform rollback — should copy dstPath back to srcPath
    engine.rollback(txId);

    expect(existsSync(srcPath)).toBe(true);
    const row = db.prepare('SELECT phase FROM TransactionJournal WHERE transaction_id = ?')
                  .get(txId) as { phase: string };
    expect(row.phase).toBe('ROLLBACK');
  });

  it('markInterrupted sets interrupted flag', () => {
    const txId = engine.begin(1, 'RENAME', '/a', '/b', 'HASHED');
    engine.markInterrupted(txId);

    const row = db.prepare('SELECT interrupted, phase FROM TransactionJournal WHERE transaction_id = ?')
                  .get(txId) as { interrupted: number; phase: string };
    expect(row.interrupted).toBe(1);
    expect(row.phase).toBe('INTERRUPTED');
  });

  it('getInterrupted returns only unresolved interrupted transactions', () => {
    const tx1 = engine.begin(1, 'MOVE', '/a', '/b', 'HASHED');
    engine.markInterrupted(tx1);

    const tx2 = engine.begin(1, 'MOVE', '/c', '/d', 'HASHED');
    engine.commit(tx2, 'CLASSIFIED');

    const interrupted = engine.getInterrupted();
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]!.transactionId).toBe(tx1);
  });
});
