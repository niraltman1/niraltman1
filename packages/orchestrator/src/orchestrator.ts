import { WorkflowStage, WorkflowStatus, WorkflowState } from './types.js';

interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): T;
}

const STAGE_ORDER: WorkflowStage[] = [
  'OCR_DONE',
  'ENTITY_EXTRACTION_DONE',
  'INDEXING_DONE',
  'MEMORY_WRITTEN',
  'READY_FOR_AGENTS',
];

interface WorkflowStateRow {
  document_id: number;
  stage:       string;
  status:      string;
  version:     number;
  updated_at:  string;
}

export class Orchestrator {
  transitionStage(documentId: number, stage: WorkflowStage, status: WorkflowStatus, db: DbHandle): void {
    const now = new Date().toISOString();
    const existing = db.prepare(
      'SELECT id FROM WorkflowStates WHERE document_id = ? AND stage = ?'
    ).get(documentId, stage);

    if (existing) {
      db.prepare(
        `UPDATE WorkflowStates
         SET status = ?, version = version + 1, updated_at = ?
         WHERE document_id = ? AND stage = ?`
      ).run(status, now, documentId, stage);
    } else {
      db.prepare(
        `INSERT INTO WorkflowStates (document_id, stage, status, version, updated_at)
         VALUES (?, ?, ?, 1, ?)`
      ).run(documentId, stage, status, now);
    }
  }

  getState(documentId: number, stage: WorkflowStage, db: DbHandle): WorkflowState | null {
    const row = db.prepare(
      'SELECT document_id, stage, status, version, updated_at FROM WorkflowStates WHERE document_id = ? AND stage = ?'
    ).get(documentId, stage) as WorkflowStateRow | undefined;

    if (!row) return null;

    return {
      documentId: row.document_id,
      stage:      row.stage as WorkflowStage,
      status:     row.status as WorkflowStatus,
      version:    row.version,
      updatedAt:  row.updated_at,
    };
  }

  isStageCompleted(documentId: number, stage: WorkflowStage, db: DbHandle): boolean {
    const state = this.getState(documentId, stage, db);
    return state?.status === 'COMPLETED';
  }

  canProceedToStage(documentId: number, stage: WorkflowStage, db: DbHandle): boolean {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    if (stageIndex <= 0) return true;

    const priorStages = STAGE_ORDER.slice(0, stageIndex);
    return priorStages.every(priorStage => this.isStageCompleted(documentId, priorStage, db));
  }

  acquireLock(documentId: number, db: DbHandle): boolean {
    const key = `lock:${documentId}`;
    const result = db.prepare(
      'INSERT OR IGNORE INTO WorkflowIdempotencyLog (idempotency_key) VALUES (?)'
    ).run(key);
    return result.changes > 0;
  }

  releaseLock(documentId: number, db: DbHandle): void {
    const key = `lock:${documentId}`;
    db.prepare(
      'DELETE FROM WorkflowIdempotencyLog WHERE idempotency_key = ?'
    ).run(key);
  }
}

export const orchestrator = new Orchestrator();
