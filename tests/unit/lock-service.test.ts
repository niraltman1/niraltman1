import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LockService } from '../../packages/pipeline/src/lock-service.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Locks (
      resource_key TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('LockService', () => {
  let db: Database.Database;
  let svc: LockService;

  beforeEach(() => {
    db = createTestDb();
    svc = new LockService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('acquires a free lock', () => {
    const acquired = svc.acquire('resource:1', 30_000);
    expect(acquired).toBe(true);
  });

  it('does not acquire a lock already held by another owner', () => {
    const other = new LockService(db);
    other.acquire('resource:1', 30_000);
    const acquired = svc.acquire('resource:1', 30_000);
    expect(acquired).toBe(false);
  });

  it('acquires an expired lock', () => {
    db.exec(`
      INSERT INTO Locks (resource_key, owner_id, expires_at)
      VALUES ('resource:expired', 'old-owner', datetime('now', '-1 second'))
    `);
    const acquired = svc.acquire('resource:expired', 30_000);
    expect(acquired).toBe(true);
  });

  it('isHeld returns true for owned lock', () => {
    svc.acquire('resource:2', 30_000);
    expect(svc.isHeld('resource:2')).toBe(true);
  });

  it('isHeld returns false for unowned lock', () => {
    expect(svc.isHeld('resource:missing')).toBe(false);
  });

  it('releases a lock', () => {
    svc.acquire('resource:3', 30_000);
    svc.release('resource:3');
    expect(svc.isHeld('resource:3')).toBe(false);
  });

  it('releaseAll releases every lock this owner holds', () => {
    svc.acquire('r:a', 30_000);
    svc.acquire('r:b', 30_000);
    svc.releaseAll();
    expect(svc.isHeld('r:a')).toBe(false);
    expect(svc.isHeld('r:b')).toBe(false);
  });

  it('purgeExpired removes stale locks from DB', () => {
    db.exec(`
      INSERT INTO Locks (resource_key, owner_id, expires_at)
      VALUES ('r:stale', 'ghost', datetime('now', '-5 minutes'))
    `);
    svc.purgeExpired();
    const row = db.prepare('SELECT 1 FROM Locks WHERE resource_key = ?').get('r:stale');
    expect(row).toBeUndefined();
  });
});
