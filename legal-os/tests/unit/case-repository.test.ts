import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ClientRepository } from '../../packages/database/src/queries/clients.js';
import { CaseRepository }   from '../../packages/database/src/queries/cases.js';

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

    CREATE TABLE IF NOT EXISTS Cases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number     TEXT    UNIQUE NOT NULL,
      case_type       TEXT    NOT NULL DEFAULT 'civil',
      title_he        TEXT    NOT NULL,
      title_en        TEXT,
      client_id       INTEGER NOT NULL REFERENCES Clients(id) ON DELETE RESTRICT,
      lead_lawyer_id  INTEGER,
      judge_id        INTEGER,
      court_name      TEXT,
      opened_date     TEXT,
      closed_date     TEXT,
      status          TEXT    NOT NULL DEFAULT 'open',
      notes           TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS Documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      file_hash         TEXT    NOT NULL UNIQUE,
      original_path     TEXT    NOT NULL,
      storage_path      TEXT    NOT NULL,
      filename          TEXT    NOT NULL,
      extension         TEXT    NOT NULL,
      file_size_bytes   INTEGER NOT NULL,
      mime_type         TEXT,
      case_id           INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
      client_id         INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
      document_type     TEXT,
      document_date     TEXT,
      ocr_text          TEXT,
      processing_state  TEXT    NOT NULL DEFAULT 'DISCOVERED',
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS ProcessingStatus (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
      from_state      TEXT    NOT NULL,
      to_state        TEXT    NOT NULL,
      agent           TEXT    NOT NULL,
      success         INTEGER NOT NULL DEFAULT 1,
      error_message   TEXT,
      duration_ms     INTEGER,
      transitioned_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
  return db;
}

describe('CaseRepository', () => {
  let db:        Database.Database;
  let clients:   ClientRepository;
  let cases:     CaseRepository;
  let clientId:  number;

  beforeEach(() => {
    db      = createTestDb();
    clients = new ClientRepository(db);
    cases   = new CaseRepository(db);
    clientId = clients.create({ nameHe: 'לקוח בדיקה' }).id;
  });

  afterEach(() => { db.close(); });

  it('creates a case linked to a client', () => {
    const cs = cases.create({ caseNumber: '2024/001', titleHe: 'תיק ראשון', clientId });
    expect(cs.id).toBeGreaterThan(0);
    expect(cs.caseNumber).toBe('2024/001');
    expect(cs.clientId).toBe(clientId);
    expect(cs.status).toBe('open');
  });

  it('findById returns the created case', () => {
    const created = cases.create({ caseNumber: '2024/002', titleHe: 'תיק שני', clientId });
    const found   = cases.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.titleHe).toBe('תיק שני');
  });

  it('findById returns null for non-existent id', () => {
    expect(cases.findById(9999)).toBeNull();
  });

  it('findByClientId returns all cases for a client', () => {
    cases.create({ caseNumber: '2024/003', titleHe: 'תיק א', clientId });
    cases.create({ caseNumber: '2024/004', titleHe: 'תיק ב', clientId });

    const results = cases.findByClientId(clientId);
    expect(results).toHaveLength(2);
    expect(results.every((c) => c.clientId === clientId)).toBe(true);
  });

  it('findByClientId filters by status', () => {
    cases.create({ caseNumber: '2024/005', titleHe: 'פתוח', clientId, status: 'open' });
    cases.create({ caseNumber: '2024/006', titleHe: 'סגור', clientId, status: 'closed' });

    const open = cases.findByClientId(clientId, 'open');
    expect(open).toHaveLength(1);
    expect(open[0]!.status).toBe('open');
  });

  it('update modifies specified fields', () => {
    const created = cases.create({ caseNumber: '2024/007', titleHe: 'לפני עדכון', clientId });
    const updated = cases.update(created.id, { status: 'closed', courtName: 'שלום תל אביב' });
    expect(updated!.status).toBe('closed');
    expect(updated!.courtName).toBe('שלום תל אביב');
    expect(updated!.titleHe).toBe('לפני עדכון');
  });

  it('list returns paginated cases with total', () => {
    cases.create({ caseNumber: '2024/010', titleHe: 'תיק 1', clientId });
    cases.create({ caseNumber: '2024/011', titleHe: 'תיק 2', clientId });
    cases.create({ caseNumber: '2024/012', titleHe: 'תיק 3', clientId });

    const page1 = cases.list(1, 2);
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
  });

  it('getTimeline returns processing events linked to case documents', () => {
    const cs = cases.create({ caseNumber: '2024/100', titleHe: 'תיק ציר', clientId });

    db.prepare(`
      INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes, case_id)
      VALUES ('abc', '/in/doc.pdf', '/store/doc.pdf', 'doc.pdf', '.pdf', 1024, ?)
    `).run(cs.id);

    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

    db.prepare(`
      INSERT INTO ProcessingStatus (document_id, from_state, to_state, agent)
      VALUES (?, 'DISCOVERED', 'HASHED', 'hasher')
    `).run(docId);

    const timeline = cases.getTimeline(cs.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.state).toBe('HASHED');
    expect(timeline[0]!.documentName).toBe('doc.pdf');
    expect(timeline[0]!.success).toBe(true);
  });
});
