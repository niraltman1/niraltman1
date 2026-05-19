import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ClientRepository } from '../../packages/database/src/queries/clients.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Clients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      name_he     TEXT    NOT NULL,
      name_en     TEXT,
      id_number   TEXT,
      id_type     TEXT    NOT NULL DEFAULT 'personal',
      phone       TEXT,
      email       TEXT,
      address_he  TEXT,
      notes       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  return db;
}

describe('ClientRepository', () => {
  let db:   Database.Database;
  let repo: ClientRepository;

  beforeEach(() => {
    db   = createTestDb();
    repo = new ClientRepository(db);
  });

  afterEach(() => { db.close(); });

  it('creates a client and returns it with assigned id', () => {
    const client = repo.create({ nameHe: 'ישראל ישראלי', idNumber: '123456782' });
    expect(client.id).toBeGreaterThan(0);
    expect(client.nameHe).toBe('ישראל ישראלי');
    expect(client.idNumber).toBe('123456782');
    expect(client.isActive).toBe(true);
  });

  it('findById returns the created client', () => {
    const created = repo.create({ nameHe: 'ראובן שמעון' });
    const found   = repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.nameHe).toBe('ראובן שמעון');
  });

  it('findById returns null for non-existent id', () => {
    expect(repo.findById(9999)).toBeNull();
  });

  it('findByIdNumber returns the correct client', () => {
    repo.create({ nameHe: 'יוסף לוי', idNumber: '039337423' });
    const found = repo.findByIdNumber('039337423');
    expect(found).not.toBeNull();
    expect(found!.nameHe).toBe('יוסף לוי');
  });

  it('update modifies specified fields only', () => {
    const original = repo.create({ nameHe: 'דוד כהן', phone: '050-0000000' });
    const updated  = repo.update(original.id, { phone: '052-1111111' });
    expect(updated).not.toBeNull();
    expect(updated!.phone).toBe('052-1111111');
    expect(updated!.nameHe).toBe('דוד כהן');
  });

  it('update returns null for non-existent id', () => {
    expect(repo.update(9999, { nameHe: 'לא קיים' })).toBeNull();
  });

  it('update with empty object returns original client unchanged', () => {
    const original = repo.create({ nameHe: 'משה לוי' });
    const result   = repo.update(original.id, {});
    expect(result!.nameHe).toBe('משה לוי');
  });

  it('list returns paginated results with total', () => {
    repo.create({ nameHe: 'לקוח א' });
    repo.create({ nameHe: 'לקוח ב' });
    repo.create({ nameHe: 'לקוח ג' });

    const page1 = repo.list(1, 2);
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);

    const page2 = repo.list(2, 2);
    expect(page2.items).toHaveLength(1);
  });

  it('deactivate sets is_active to false', () => {
    const client = repo.create({ nameHe: 'מופחת' });
    repo.deactivate(client.id);
    const found = repo.findById(client.id);
    expect(found!.isActive).toBe(false);
  });

  it('list excludes deactivated clients', () => {
    repo.create({ nameHe: 'פעיל' });
    const inactive = repo.create({ nameHe: 'לא פעיל' });
    repo.deactivate(inactive.id);

    const result = repo.list(1, 50);
    expect(result.total).toBe(1);
    expect(result.items.every((c) => c.isActive)).toBe(true);
  });
});
