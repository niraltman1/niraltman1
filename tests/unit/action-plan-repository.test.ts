import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ActionPlanRepository } from '../../packages/database/src/queries/action-plan.js';

const BRANDED_ROOT = 'C:\\אלטמן משרד עורכי דין - סדר 2026\\';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
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
      ai_enriched    INTEGER NOT NULL DEFAULT 0 CHECK(ai_enriched IN (0,1)),
      confidence     REAL    CHECK(confidence BETWEEN 0.0 AND 1.0),
      signed_at      TEXT,
      executed_at    TEXT,
      error_message  TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('ActionPlanRepository', () => {
  let db:   Database.Database;
  let repo: ActionPlanRepository;

  beforeEach(() => {
    db   = createTestDb();
    repo = new ActionPlanRepository(db);
  });

  afterEach(() => { db.close(); });

  it('createEntry inserts a row and returns a UUID', () => {
    const id = repo.createEntry({
      originalName:  'document.pdf',
      sourceFolder:  'תיקיית הורדות',
      originalPath:  'C:\\Users\\user\\Downloads\\document.pdf',
      suggestedName: '2024-01-01_חוזה.pdf',
      suggestedPath: `${BRANDED_ROOT}Legal\\2024-01-01_חוזה.pdf`,
      actionType:    'RENAME_AND_MOVE',
      aiEnriched:    true,
      confidence:    0.92,
    });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('list returns all entries', () => {
    repo.createEntry({ originalName: 'a.pdf', sourceFolder: 'ידני', originalPath: 'C:\\a.pdf' });
    repo.createEntry({ originalName: 'b.pdf', sourceFolder: 'ידני', originalPath: 'C:\\b.pdf' });
    expect(repo.list()).toHaveLength(2);
  });

  it('list filters by status', () => {
    const id = repo.createEntry({ originalName: 'x.pdf', sourceFolder: 'ידני', originalPath: 'C:\\x.pdf' });
    repo.approve([id]);
    expect(repo.list('PENDING')).toHaveLength(0);
    expect(repo.list('APPROVED')).toHaveLength(1);
  });

  it('approve sets status to APPROVED and records signed_at', () => {
    const id    = repo.createEntry({ originalName: 'doc.pdf', sourceFolder: 'ידני', originalPath: 'C:\\doc.pdf' });
    repo.approve([id]);
    const entry = repo.findById(id);
    expect(entry!.status).toBe('APPROVED');
    expect(entry!.signedAt).not.toBeNull();
  });

  it('approve is a no-op for already-rejected entries', () => {
    const id = repo.createEntry({ originalName: 'r.pdf', sourceFolder: 'ידני', originalPath: 'C:\\r.pdf' });
    repo.reject([id]);
    repo.approve([id]);
    expect(repo.findById(id)!.status).toBe('REJECTED');
  });

  it('reject sets status to REJECTED', () => {
    const id = repo.createEntry({ originalName: 'n.pdf', sourceFolder: 'ידני', originalPath: 'C:\\n.pdf' });
    repo.reject([id]);
    expect(repo.findById(id)!.status).toBe('REJECTED');
  });

  it('getSignedPlan returns only APPROVED entries with their data', () => {
    const id1 = repo.createEntry({ originalName: 'a.pdf', sourceFolder: 'תיקיית הורדות', originalPath: 'C:\\a.pdf', suggestedPath: `${BRANDED_ROOT}Legal\\a.pdf` });
    const id2 = repo.createEntry({ originalName: 'b.pdf', sourceFolder: 'ידני', originalPath: 'C:\\b.pdf' });
    repo.approve([id1]);
    // id2 stays PENDING

    const plan = repo.getSignedPlan([id1, id2]);
    expect(plan.totalEntries).toBe(1);
    expect(plan.entries[0]!.planId).toBe(id1);
    expect(plan.entries[0]!.suggestedPath).toBe(`${BRANDED_ROOT}Legal\\a.pdf`);
    expect(plan.signedAt).toBeDefined();
  });

  it('getSignedPlan returns empty plan for empty input', () => {
    const plan = repo.getSignedPlan([]);
    expect(plan.totalEntries).toBe(0);
    expect(plan.entries).toHaveLength(0);
  });

  it('markExecuted sets status to EXECUTED on success', () => {
    const id = repo.createEntry({ originalName: 'e.pdf', sourceFolder: 'ידני', originalPath: 'C:\\e.pdf' });
    repo.approve([id]);
    repo.markExecuted(id, true);
    expect(repo.findById(id)!.status).toBe('EXECUTED');
  });

  it('markExecuted sets status to FAILED with error message on failure', () => {
    const id = repo.createEntry({ originalName: 'f.pdf', sourceFolder: 'ידני', originalPath: 'C:\\f.pdf' });
    repo.markExecuted(id, false, 'Permission denied');
    const entry = repo.findById(id);
    expect(entry!.status).toBe('FAILED');
    expect(entry!.errorMessage).toBe('Permission denied');
  });

  it('source attribution persists correctly for downloads folder', () => {
    const id = repo.createEntry({
      originalName:  'invoice.pdf',
      sourceFolder:  'תיקיית הורדות',
      originalPath:  'C:\\Users\\user\\Downloads\\invoice.pdf',
      suggestedPath: `${BRANDED_ROOT}Legal\\invoice_2024.pdf`,
    });
    const entry = repo.findById(id)!;
    expect(entry.sourceFolder).toBe('תיקיית הורדות');
    expect(entry.suggestedPath).toContain(BRANDED_ROOT);
  });
});
