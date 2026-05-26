import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ClientRepository }     from '../../packages/database/src/queries/clients.js';
import { CaseRepository }       from '../../packages/database/src/queries/cases.js';
import { ActionPlanRepository } from '../../packages/database/src/queries/action-plan.js';

const BRANDED_ROOT = 'C:\\אלטמן משרד עורכי דין - סדר 2026\\';

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

    CREATE TABLE IF NOT EXISTS ActionPlan (
      plan_id        TEXT    PRIMARY KEY,
      document_id    INTEGER,
      original_name  TEXT    NOT NULL,
      suggested_name TEXT,
      source_folder  TEXT    NOT NULL DEFAULT 'ידני',
      original_path  TEXT    NOT NULL,
      suggested_path TEXT,
      action_type    TEXT    NOT NULL DEFAULT 'RENAME'
                     CHECK(action_type IN ('RENAME','MOVE','RENAME_AND_MOVE','SKIP')),
      status         TEXT    NOT NULL DEFAULT 'PENDING'
                     CHECK(status IN ('PENDING','APPROVED','REJECTED','EXECUTED','FAILED')),
      ai_enriched    INTEGER NOT NULL DEFAULT 0,
      confidence     REAL,
      signed_at      TEXT,
      executed_at    TEXT,
      error_message  TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('Client → Case → Document → Timeline → ActionPlan flow', () => {
  let db:         Database.Database;
  let clientRepo: ClientRepository;
  let caseRepo:   CaseRepository;
  let planRepo:   ActionPlanRepository;

  beforeEach(() => {
    db         = createTestDb();
    clientRepo = new ClientRepository(db);
    caseRepo   = new CaseRepository(db);
    planRepo   = new ActionPlanRepository(db);
  });

  afterEach(() => { db.close(); });

  it('full flow: create client → case → document → timeline → action plan sign', () => {
    // 1. Create client
    const client = clientRepo.create({
      nameHe:   'נירה אלטמן',
      idNumber: '123456782',
      phone:    '054-0000000',
    });
    expect(client.id).toBeGreaterThan(0);
    expect(client.nameHe).toBe('נירה אלטמן');

    // 2. Create case linked to client
    const cs = caseRepo.create({
      caseNumber: '2024/999',
      titleHe:    'תיק אינטגרציה',
      clientId:   client.id,
      caseType:   'civil',
      status:     'open',
    });
    expect(cs.clientId).toBe(client.id);

    // 3. Attach document and processing events
    db.prepare(`
      INSERT INTO Documents (file_hash, original_path, storage_path, filename, extension, file_size_bytes, case_id, client_id)
      VALUES ('hash_integration', '/in/contract.pdf', '/store/contract.pdf', 'contract.pdf', '.pdf', 2048, ?, ?)
    `).run(cs.id, client.id);

    const docId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

    db.prepare(`
      INSERT INTO ProcessingStatus (document_id, from_state, to_state, agent, success)
      VALUES (?, 'DISCOVERED', 'HASHED', 'hasher', 1),
             (?, 'HASHED', 'OCR_COMPLETE', 'ocr-worker', 1),
             (?, 'OCR_COMPLETE', 'CLASSIFIED', 'classifier', 1)
    `).run(docId, docId, docId);

    // 4. Get timeline
    const timeline = caseRepo.getTimeline(cs.id);
    expect(timeline).toHaveLength(3);
    expect(timeline[0]!.prevState).toBe('DISCOVERED');
    expect(timeline[2]!.state).toBe('CLASSIFIED');
    expect(timeline[0]!.documentName).toBe('contract.pdf');

    // 5. Create action plan entry for the document
    const planId = planRepo.createEntry({
      documentId:    docId,
      originalName:  'contract.pdf',
      suggestedName: '2024-01-01_חוזה-אינטגרציה.pdf',
      sourceFolder:  'תיקיית הורדות',
      originalPath:  '/in/contract.pdf',
      suggestedPath: `${BRANDED_ROOT}Legal\\2024-01-01_חוזה-אינטגרציה.pdf`,
      actionType:    'RENAME_AND_MOVE',
      aiEnriched:    true,
      confidence:    0.95,
    });
    expect(planId).toBeDefined();

    // 6. Approve and sign
    planRepo.approve([planId]);
    const signed = planRepo.getSignedPlan([planId]);
    expect(signed.totalEntries).toBe(1);
    expect(signed.entries[0]!.sourceFolder).toBe('תיקיית הורדות');
    expect(signed.entries[0]!.suggestedPath).toContain(BRANDED_ROOT);
    expect(signed.entries[0]!.confidence).toBe(0.95);

    // 7. Mark as executed
    planRepo.markExecuted(planId, true);
    expect(planRepo.findById(planId)!.status).toBe('EXECUTED');

    // 8. Verify client list still shows the client
    const clientList = clientRepo.list(1, 10);
    expect(clientList.items.some((c) => c.id === client.id)).toBe(true);
  });
});
