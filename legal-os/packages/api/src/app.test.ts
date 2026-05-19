import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import {
  ClientRepository,
  CaseRepository,
  DocumentRepository,
  QueueRepository,
  ActionPlanRepository,
  BackupRepository,
  SearchEngine,
  DatabaseHardening,
} from '@factum-il/database';
import { createApp } from './app.js';
import type { Repos } from './db.js';

function buildTestDb(): Database.Database {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(`
    CREATE TABLE _migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      checksum  TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE Clients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT,
      name_he     TEXT NOT NULL,
      name_en     TEXT,
      id_number   TEXT,
      id_type     TEXT NOT NULL DEFAULT 'personal',
      phone       TEXT,
      email       TEXT,
      address_he  TEXT,
      notes       TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE Cases (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number    TEXT UNIQUE NOT NULL,
      case_type      TEXT NOT NULL DEFAULT 'civil',
      title_he       TEXT NOT NULL,
      title_en       TEXT,
      client_id      INTEGER NOT NULL REFERENCES Clients(id) ON DELETE RESTRICT,
      lead_lawyer_id INTEGER,
      judge_id       INTEGER,
      court_name     TEXT,
      opened_date    TEXT,
      closed_date    TEXT,
      status         TEXT NOT NULL DEFAULT 'open',
      notes          TEXT,
      created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE Documents (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      file_hash         TEXT NOT NULL UNIQUE,
      original_path     TEXT NOT NULL,
      storage_path      TEXT NOT NULL,
      filename          TEXT NOT NULL,
      extension         TEXT NOT NULL,
      file_size_bytes   INTEGER NOT NULL,
      mime_type         TEXT,
      case_id           INTEGER REFERENCES Cases(id) ON DELETE SET NULL,
      client_id         INTEGER REFERENCES Clients(id) ON DELETE SET NULL,
      document_type     TEXT,
      document_date     TEXT,
      ocr_text          TEXT,
      tags              TEXT,
      processing_state  TEXT NOT NULL DEFAULT 'DISCOVERED',
      created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE VIRTUAL TABLE fts_clients USING fts5(
      name_he, name_en, id_number, notes,
      content='Clients', content_rowid='id',
      tokenize='unicode61'
    );

    CREATE VIRTUAL TABLE fts_documents USING fts5(
      filename, ocr_text, document_type, tags,
      content='Documents', content_rowid='id',
      tokenize='unicode61'
    );

    CREATE VIRTUAL TABLE fts_cases USING fts5(
      case_number, title_he, title_en, notes,
      content='Cases', content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TABLE ProcessingStatus (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
      from_state      TEXT NOT NULL,
      to_state        TEXT NOT NULL,
      agent           TEXT NOT NULL,
      success         INTEGER NOT NULL DEFAULT 1,
      error_message   TEXT,
      duration_ms     INTEGER,
      transitioned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE ProcessingQueue (
      id            TEXT PRIMARY KEY,
      document_id   INTEGER REFERENCES Documents(id) ON DELETE CASCADE,
      current_state TEXT NOT NULL DEFAULT 'QUEUED',
      retry_count   INTEGER NOT NULL DEFAULT 0,
      max_retries   INTEGER NOT NULL DEFAULT 3,
      is_poisoned   INTEGER NOT NULL DEFAULT 0,
      locked_by     TEXT,
      locked_at     TEXT,
      next_retry_at TEXT,
      error_message TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE ActionPlan (
      plan_id        TEXT PRIMARY KEY,
      document_id    INTEGER,
      original_name  TEXT NOT NULL,
      suggested_name TEXT,
      source_folder  TEXT NOT NULL DEFAULT 'ידני',
      original_path  TEXT NOT NULL,
      suggested_path TEXT,
      action_type    TEXT NOT NULL DEFAULT 'RENAME'
                     CHECK(action_type IN ('RENAME','MOVE','RENAME_AND_MOVE','SKIP')),
      status         TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK(status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED')),
      ai_enriched    INTEGER NOT NULL DEFAULT 0,
      confidence     REAL,
      signed_at      TEXT,
      executed_at    TEXT,
      error_message  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE Backups (
      snapshot_id    TEXT PRIMARY KEY,
      backup_path    TEXT NOT NULL,
      size_bytes     INTEGER NOT NULL DEFAULT 0,
      document_count INTEGER NOT NULL DEFAULT 0,
      db_integrity   TEXT NOT NULL DEFAULT 'unchecked',
      verified       INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE WorkerHealth (
      worker_id      TEXT PRIMARY KEY,
      worker_type    TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'idle',
      last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
      metadata       TEXT
    );

    CREATE TABLE WatcherEvents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT NOT NULL,
      file_path   TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed   INTEGER NOT NULL DEFAULT 0
    );
  `);
  return raw;
}

let rawDb: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  rawDb = buildTestDb();

  // DatabaseConnection wraps better-sqlite3; we pass the raw db object by casting
  const db = rawDb as unknown as import('@factum-il/database').DatabaseConnection;

  const repos: Repos = {
    db,
    clients:    new ClientRepository(db),
    cases:      new CaseRepository(db),
    documents:  new DocumentRepository(db),
    queue:      new QueueRepository(db),
    actionPlan: new ActionPlanRepository(db),
    backups:    new BackupRepository(db),
    search:     new SearchEngine(db),
    hardening:  new DatabaseHardening(db),
  };
  app = createApp(repos);
});

afterAll(() => {
  rawDb.close();
});

describe('GET /api/clients', () => {
  it('returns empty list initially', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });
});

describe('POST /api/clients', () => {
  it('creates a client and returns id', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({ nameHe: 'נירה אלטמן', idType: 'personal' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.id).toBe('number');
  });

  it('rejects missing nameHe with 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({ nameEn: 'Missing Hebrew Name' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown fields (strict mode)', async () => {
    const res = await request(app)
      .post('/api/clients')
      .send({ nameHe: 'בדיקה', unknownField: true });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/clients/:id', () => {
  it('returns 404 for non-existent client', async () => {
    const res = await request(app).get('/api/clients/99999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns existing client', async () => {
    const create = await request(app)
      .post('/api/clients')
      .send({ nameHe: 'ישראל ישראלי' });
    const { id } = create.body.data as { id: number };
    const res = await request(app).get(`/api/clients/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.nameHe).toBe('ישראל ישראלי');
  });
});

describe('PATCH /api/clients/:id', () => {
  it('updates client and returns updated object', async () => {
    const create = await request(app)
      .post('/api/clients')
      .send({ nameHe: 'שם ישן' });
    const { id } = create.body.data as { id: number };
    const res = await request(app)
      .patch(`/api/clients/${id}`)
      .send({ nameHe: 'שם חדש' });
    expect(res.status).toBe(200);
    expect(res.body.data.nameHe).toBe('שם חדש');
  });
});

describe('POST /api/cases', () => {
  it('creates a case linked to a client', async () => {
    const clientRes = await request(app)
      .post('/api/clients')
      .send({ nameHe: 'לקוח לתיק' });
    const clientId = (clientRes.body.data as { id: number }).id;

    const res = await request(app)
      .post('/api/cases')
      .send({ caseNumber: 'TK-001', titleHe: 'תיק בדיקה', clientId });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.id).toBe('number');
  });
});

describe('GET /api/action-plan', () => {
  it('returns empty list for PENDING status', async () => {
    const res = await request(app).get('/api/action-plan?status=PENDING');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/action-plan/approve', () => {
  it('rejects empty planIds array with 422', async () => {
    const res = await request(app)
      .post('/api/action-plan/approve')
      .send({ planIds: [] });
    expect(res.status).toBe(422);
  });

  it('approves (no-op for non-existent IDs)', async () => {
    const res = await request(app)
      .post('/api/action-plan/approve')
      .send({ planIds: ['plan-does-not-exist'] });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/search', () => {
  it('returns empty array for empty query', async () => {
    const res = await request(app).get('/api/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns array for valid Hebrew query', async () => {
    const res = await request(app).get('/api/search?q=%D7%99%D7%A9%D7%A8%D7%90%D7%9C');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/queue/stats', () => {
  it('returns stats with expected shape', async () => {
    const res = await request(app).get('/api/queue/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.poisoned).toBe('number');
    expect(typeof res.body.data.byState).toBe('object');
  });
});
