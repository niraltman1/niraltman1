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
  AnnotationRepository,
  RulesEngineRepository,
  LegalCorpusRepository,
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
      procedure_type TEXT,
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

    CREATE TABLE Annotations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id     INTEGER NOT NULL REFERENCES Documents(id) ON DELETE CASCADE,
      page_number     INTEGER NOT NULL DEFAULT 1,
      annotation_type TEXT NOT NULL CHECK(annotation_type IN ('highlight','note','redline','bookmark')),
      color           TEXT,
      x               REAL,
      y               REAL,
      width           REAL,
      height          REAL,
      content         TEXT,
      created_by      TEXT,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE Entities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT NOT NULL,
      canonical   TEXT NOT NULL,
      aliases     TEXT NOT NULL DEFAULT '[]',
      case_id     INTEGER,
      document_id INTEGER,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(kind, canonical)
    );

    CREATE TABLE EntityRelations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id    INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
      to_id      INTEGER NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
      relation   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(from_id, to_id, relation)
    );

    CREATE TABLE DocumentInsights (
      document_id INTEGER, case_number TEXT, court_name TEXT, judge_name TEXT
    );

    CREATE TABLE Rules_Engine (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name        TEXT    NOT NULL,
      procedure_type   TEXT    NOT NULL,
      description      TEXT,
      deadline_days    INTEGER,
      deadline_basis   TEXT,
      source_reference TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(procedure_type, rule_name)
    );

    CREATE TABLE LegalSources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_key TEXT NOT NULL UNIQUE, title_he TEXT NOT NULL,
      short_name TEXT, citation TEXT, source_type TEXT NOT NULL DEFAULT 'statute',
      procedure_domain TEXT, source_url TEXT, year INTEGER, content_hash TEXT,
      section_count INTEGER NOT NULL DEFAULT 0, fetched_at TEXT, is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE LegalSections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
      section_label TEXT NOT NULL, heading_he TEXT, verbatim_text_he TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0, parent_label TEXT, char_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(source_id, section_label)
    );
    CREATE TABLE LegalSectionEmbeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL UNIQUE REFERENCES LegalSections(id) ON DELETE CASCADE,
      source_id INTEGER NOT NULL REFERENCES LegalSources(id) ON DELETE CASCADE,
      embedding TEXT NOT NULL, model TEXT NOT NULL DEFAULT 'nomic-embed-text',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE VIRTUAL TABLE fts_legal_sections USING fts5(
      heading_he, verbatim_text_he, content='LegalSections', content_rowid='id', tokenize='unicode61'
    );
    CREATE TRIGGER trg_legal_sections_ai AFTER INSERT ON LegalSections BEGIN
      INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he)
      VALUES (new.id, new.heading_he, new.verbatim_text_he);
    END;
    CREATE TRIGGER trg_legal_sections_ad AFTER DELETE ON LegalSections BEGIN
      INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he)
      VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
    END;
    CREATE TRIGGER trg_legal_sections_au AFTER UPDATE ON LegalSections BEGIN
      INSERT INTO fts_legal_sections(fts_legal_sections, rowid, heading_he, verbatim_text_he)
      VALUES ('delete', old.id, old.heading_he, old.verbatim_text_he);
      INSERT INTO fts_legal_sections(rowid, heading_he, verbatim_text_he)
      VALUES (new.id, new.heading_he, new.verbatim_text_he);
    END;

    CREATE TABLE audit_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type    TEXT NOT NULL,
      actor_id      INTEGER,
      actor_role    TEXT,
      resource_type TEXT NOT NULL,
      resource_id   TEXT,
      action_detail TEXT,
      ip_address    TEXT,
      user_agent    TEXT,
      severity      TEXT NOT NULL DEFAULT 'info',
      logged_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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
    annotations: new AnnotationRepository(db),
    rules:       new RulesEngineRepository(db),
    legalCorpus: new LegalCorpusRepository(db),
  };

  // Seed a couple of procedural rules across two procedure types.
  rawDb.exec(`
    INSERT INTO Rules_Engine (rule_name, procedure_type, deadline_days, sort_order)
    VALUES
      ('הגשת כתב הגנה', 'civil', 60, 1),
      ('ערעור בזכות', 'civil_appeal', 60, 1),
      ('ערעור פלילי', 'criminal', 45, 1);
  `);

  // Seed one law with two verbatim sections for the legal-corpus read API. Raw SQL (not the
  // repo) because this harness casts a bare better-sqlite3 handle as DatabaseConnection, whose
  // `transaction()` wrapper (used by replaceSections) is not present on the raw object. The FTS
  // triggers populate fts_legal_sections on INSERT, so /search works against this seed.
  rawDb.exec(`
    INSERT INTO LegalSources (source_key, title_he, short_name, source_type, procedure_domain, section_count)
    VALUES ('il_law_2000479', 'חוק העונשין, התשל"ז–1977', 'חוק העונשין', 'statute', 'criminal', 2);
    INSERT INTO LegalSections (source_id, section_label, verbatim_text_he, order_index, char_count)
    VALUES
      ((SELECT id FROM LegalSources WHERE source_key = 'il_law_2000479'), 'סעיף 1', 'הגדרות — בחוק זה, המונחים הבאים יפורשו כדלקמן.', 0, 44),
      ((SELECT id FROM LegalSources WHERE source_key = 'il_law_2000479'), 'סעיף 2', 'עבירה היא מעשה האסור על פי דין או מחדל האסור על פי דין.', 1, 54);
  `);

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

describe('Rules_Engine API', () => {
  it('lists all active rules', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].ruleName).toBeDefined();
    expect(res.body.data[0].procedureType).toBeDefined();
  });

  it('filters rules by procedureType', async () => {
    const res = await request(app).get('/api/rules?procedureType=civil');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].procedureType).toBe('civil');
    expect(res.body.data[0].deadlineDays).toBe(60);
  });

  it('returns procedure types with counts', async () => {
    const res = await request(app).get('/api/rules/types');
    expect(res.status).toBe(200);
    const types = res.body.data as { procedureType: string; ruleCount: number }[];
    expect(types).toHaveLength(3);
    const civil = types.find((t) => t.procedureType === 'civil');
    expect(civil?.ruleCount).toBe(1);
  });

  it('returns a single rule by id', async () => {
    const list = await request(app).get('/api/rules?procedureType=criminal');
    const id = list.body.data[0].id as number;
    const res = await request(app).get(`/api/rules/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.procedureType).toBe('criminal');
    expect(res.body.data.deadlineDays).toBe(45);
  });

  it('returns 404 for a non-existent rule', async () => {
    const res = await request(app).get('/api/rules/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Annotations API', () => {
  let docId: number;

  beforeAll(() => {
    const info = rawDb.prepare(`
      INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes, mime_type)
      VALUES ('annot-hash-1', '/in/doc.pdf', '/store/doc.pdf', 'doc.pdf', '.pdf', 1024, 'application/pdf')
    `).run();
    docId = Number(info.lastInsertRowid);
  });

  it('GET requires documentId (422)', async () => {
    const res = await request(app).get('/api/annotations');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty list for a document with no annotations', async () => {
    const res = await request(app).get(`/api/annotations?documentId=${docId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects POST without documentId (422)', async () => {
    const res = await request(app).post('/api/annotations').send({ annotationType: 'note' });
    expect(res.status).toBe(422);
  });

  it('rejects POST with invalid annotationType (422)', async () => {
    const res = await request(app)
      .post('/api/annotations')
      .send({ documentId: docId, annotationType: 'scribble' });
    expect(res.status).toBe(422);
  });

  it('creates, lists, updates and deletes a note annotation', async () => {
    const create = await request(app)
      .post('/api/annotations')
      .send({ documentId: docId, annotationType: 'note', pageNumber: 2, content: 'הערה ראשונה' });
    expect(create.status).toBe(201);
    const id = create.body.data.id as number;
    expect(typeof id).toBe('number');
    expect(create.body.data.pageNumber).toBe(2);

    const list = await request(app).get(`/api/annotations?documentId=${docId}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].content).toBe('הערה ראשונה');

    const byPage = await request(app).get(`/api/annotations?documentId=${docId}&page=2`);
    expect(byPage.body.data).toHaveLength(1);
    const otherPage = await request(app).get(`/api/annotations?documentId=${docId}&page=1`);
    expect(otherPage.body.data).toHaveLength(0);

    const patch = await request(app)
      .patch(`/api/annotations/${id}`)
      .send({ content: 'הערה מעודכנת' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.content).toBe('הערה מעודכנת');

    const del = await request(app).delete(`/api/annotations/${id}`);
    expect(del.status).toBe(200);

    const after = await request(app).get(`/api/annotations?documentId=${docId}`);
    expect(after.body.data).toHaveLength(0);
  });

  it('returns 404 when updating a non-existent annotation', async () => {
    const res = await request(app).patch('/api/annotations/99999').send({ content: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when deleting a non-existent annotation', async () => {
    const res = await request(app).delete('/api/annotations/99999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Entities knowledge graph API', () => {
  it('reports empty stats before any population', async () => {
    const res = await request(app).get('/api/entities/graph/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.totalEntities).toBe(0);
    expect(res.body.data.relations).toBe(0);
  });

  it('backfills the graph from DocumentInsights and reflects it in stats', async () => {
    rawDb.exec(`
      INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes)
      VALUES ('eg-hash-1', '/in/a.pdf', '/st/a.pdf', 'a.pdf', '.pdf', 10);
    `);
    const docId = (rawDb.prepare('SELECT id FROM Documents WHERE file_hash = ?').get('eg-hash-1') as { id: number }).id;
    rawDb.prepare(
      'INSERT INTO DocumentInsights (document_id, case_number, court_name, judge_name) VALUES (?,?,?,?)',
    ).run(docId, 'תא-2024-042', 'שלום תל אביב', 'השופט כהן');

    const back = await request(app).post('/api/entities/backfill');
    expect(back.status).toBe(200);
    expect(back.body.data.documents).toBe(1);

    const stats = await request(app).get('/api/entities/graph/stats');
    expect(stats.body.data.byKind.Judge).toBe(1);
    expect(stats.body.data.byKind.Court).toBe(1);
    expect(stats.body.data.byKind.Case).toBe(1);
    expect(stats.body.data.relations).toBe(3);
  });
});

describe('Legal Corpus API', () => {
  it('lists sources with KB stats', async () => {
    const res = await request(app).get('/api/legal-corpus/sources');
    expect(res.status).toBe(200);
    expect(res.body.data.stats.sources).toBe(1);
    expect(res.body.data.stats.sections).toBe(2);
    expect(res.body.data.sources[0].sourceKey).toBe('il_law_2000479');
  });

  it('returns one law with its verbatim sections', async () => {
    const res = await request(app).get('/api/legal-corpus/sources/il_law_2000479');
    expect(res.status).toBe(200);
    expect(res.body.data.source.shortName).toBe('חוק העונשין');
    expect(res.body.data.sections).toHaveLength(2);
    expect(res.body.data.sections[0].verbatimText).toContain('הגדרות');
  });

  it('returns 404 for an unknown source', async () => {
    const res = await request(app).get('/api/legal-corpus/sources/il_law_999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('keyword-searches sections, source-tagged', async () => {
    const res = await request(app).get('/api/legal-corpus/search?q=עבירה');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].sourceKey).toBe('il_law_2000479');
    expect(res.body.data[0].verbatimText).toContain('עבירה');
  });

  it('requires q (422)', async () => {
    const res = await request(app).get('/api/legal-corpus/search');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
