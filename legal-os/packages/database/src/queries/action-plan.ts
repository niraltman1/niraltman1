import type { DatabaseConnection } from '../connection.js';
import type { ActionPlanEntry, ActionPlanStatus, SignedActionPlan } from '@factum-il/shared';
import { generateUUID } from '@factum-il/shared';

export interface CreateActionPlanInput {
  documentId?:   number;
  originalName:  string;
  suggestedName?: string;
  sourceFolder:  string;
  originalPath:  string;
  suggestedPath?: string;
  actionType?:   'RENAME' | 'MOVE' | 'RENAME_AND_MOVE' | 'SKIP';
  aiEnriched?:   boolean;
  confidence?:   number;
}

export class ActionPlanRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ─────────────────────────────────────────────
  //  Read
  // ─────────────────────────────────────────────

  list(status?: ActionPlanStatus, limit = 200): ActionPlanEntry[] {
    if (status) {
      const rows = this.db.prepare(`
        SELECT * FROM ActionPlan
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(status, limit) as Record<string, unknown>[];
      return rows.map((r) => this.mapRow(r));
    }
    const rows = this.db.prepare(`
      SELECT * FROM ActionPlan
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  findById(planId: string): ActionPlanEntry | null {
    const row = this.db
      .prepare('SELECT * FROM ActionPlan WHERE plan_id = ?')
      .get(planId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getSignedPlan(planIds: string[]): SignedActionPlan {
    if (planIds.length === 0) {
      return { signedAt: new Date().toISOString(), entries: [], totalEntries: 0 };
    }

    const placeholders = planIds.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT * FROM ActionPlan
      WHERE plan_id IN (${placeholders})
        AND status = 'APPROVED'
      ORDER BY created_at ASC
    `).all(...planIds) as Record<string, unknown>[];

    const entries = rows.map((r) => this.mapRow(r));
    return {
      signedAt:     new Date().toISOString(),
      entries,
      totalEntries: entries.length,
    };
  }

  // ─────────────────────────────────────────────
  //  Write
  // ─────────────────────────────────────────────

  createEntry(data: CreateActionPlanInput): string {
    const planId = generateUUID();
    this.db.prepare(`
      INSERT INTO ActionPlan
        (plan_id, document_id, original_name, suggested_name, source_folder,
         original_path, suggested_path, action_type, ai_enriched, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      planId,
      data.documentId    ?? null,
      data.originalName,
      data.suggestedName ?? null,
      data.sourceFolder,
      data.originalPath,
      data.suggestedPath ?? null,
      data.actionType    ?? 'RENAME',
      data.aiEnriched    ? 1 : 0,
      data.confidence    ?? null,
    );
    return planId;
  }

  approve(planIds: string[]): void {
    if (planIds.length === 0) return;
    const placeholders = planIds.map(() => '?').join(', ');
    this.db.prepare(`
      UPDATE ActionPlan
      SET status = 'APPROVED', signed_at = datetime('now')
      WHERE plan_id IN (${placeholders}) AND status = 'PENDING'
    `).run(...planIds);
  }

  reject(planIds: string[]): void {
    if (planIds.length === 0) return;
    const placeholders = planIds.map(() => '?').join(', ');
    this.db.prepare(`
      UPDATE ActionPlan
      SET status = 'REJECTED'
      WHERE plan_id IN (${placeholders}) AND status IN ('PENDING','APPROVED')
    `).run(...planIds);
  }

  markExecuted(planId: string, success: boolean, errorMsg?: string): void {
    if (success) {
      this.db.prepare(`
        UPDATE ActionPlan
        SET status = 'EXECUTED', executed_at = datetime('now')
        WHERE plan_id = ?
      `).run(planId);
    } else {
      this.db.prepare(`
        UPDATE ActionPlan
        SET status = 'FAILED', executed_at = datetime('now'), error_message = ?
        WHERE plan_id = ?
      `).run(errorMsg ?? 'Unknown error', planId);
    }
  }

  // ─────────────────────────────────────────────
  //  Mapping
  // ─────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): ActionPlanEntry {
    return {
      planId:        row['plan_id'] as string,
      documentId:    (row['document_id'] as number | null) ?? null,
      originalName:  row['original_name'] as string,
      suggestedName: (row['suggested_name'] as string | null) ?? null,
      sourceFolder:  row['source_folder'] as string,
      originalPath:  row['original_path'] as string,
      suggestedPath: (row['suggested_path'] as string | null) ?? null,
      actionType:    row['action_type'] as ActionPlanEntry['actionType'],
      status:        row['status'] as ActionPlanEntry['status'],
      aiEnriched:    (row['ai_enriched'] as number) === 1,
      confidence:    (row['confidence'] as number | null) ?? null,
      signedAt:      (row['signed_at'] as string | null) ?? null,
      executedAt:    (row['executed_at'] as string | null) ?? null,
      errorMessage:  (row['error_message'] as string | null) ?? null,
      createdAt:     row['created_at'] as string,
      updatedAt:     row['updated_at'] as string,
    };
  }
}
