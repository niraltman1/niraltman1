import type { DatabaseConnection } from '../connection.js';
import type { Case, CaseCreateInput, CaseStatus, PaginatedResult, TimelineEvent } from '@legal-os/shared';

export class CaseRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ─────────────────────────────────────────────
  //  Read
  // ─────────────────────────────────────────────

  findById(id: number): Case | null {
    const row = this.db
      .prepare('SELECT * FROM Cases WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByCaseNumber(caseNumber: string): Case | null {
    const row = this.db
      .prepare('SELECT * FROM Cases WHERE case_number = ?')
      .get(caseNumber) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByClientId(clientId: number, status?: CaseStatus): Case[] {
    if (status) {
      const rows = this.db
        .prepare('SELECT * FROM Cases WHERE client_id = ? AND status = ? ORDER BY opened_date DESC, created_at DESC')
        .all(clientId, status) as Record<string, unknown>[];
      return rows.map((r) => this.mapRow(r));
    }
    const rows = this.db
      .prepare('SELECT * FROM Cases WHERE client_id = ? ORDER BY opened_date DESC, created_at DESC')
      .all(clientId) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  list(page = 1, pageSize = 50): PaginatedResult<Case> {
    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT * FROM Cases
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as Record<string, unknown>[];

    const { total } = this.db.prepare(
      'SELECT COUNT(*) as total FROM Cases'
    ).get() as { total: number };

    return { items: rows.map((r) => this.mapRow(r)), total, page, pageSize, hasNextPage: total > page * pageSize };
  }

  getTimeline(caseId: number): TimelineEvent[] {
    const rows = this.db.prepare(`
      SELECT
        ps.id                AS event_id,
        d.id                 AS document_id,
        d.filename           AS document_name,
        d.document_type      AS document_type,
        ps.to_state          AS state,
        ps.from_state        AS prev_state,
        ps.agent             AS agent,
        ps.success           AS success,
        ps.error_message     AS error_message,
        ps.transitioned_at   AS occurred_at
      FROM ProcessingStatus ps
      JOIN Documents d ON d.id = ps.document_id
      WHERE d.case_id = ?
      ORDER BY ps.transitioned_at ASC
    `).all(caseId) as Record<string, unknown>[];

    return rows.map((r) => ({
      id:           r['event_id'] as number,
      documentId:   r['document_id'] as number,
      documentName: r['document_name'] as string,
      documentType: (r['document_type'] as string | null) ?? null,
      state:        r['state'] as string,
      prevState:    r['prev_state'] as string,
      agent:        r['agent'] as string,
      success:      (r['success'] as number) === 1,
      errorMessage: (r['error_message'] as string | null) ?? null,
      occurredAt:   r['occurred_at'] as string,
    }));
  }

  // ─────────────────────────────────────────────
  //  Write
  // ─────────────────────────────────────────────

  create(input: CaseCreateInput): Case {
    const result = this.db.prepare(`
      INSERT INTO Cases (case_number, case_type, title_he, title_en, client_id,
                         lead_lawyer_id, judge_id, court_name, opened_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.caseNumber,
      input.caseType       ?? 'civil',
      input.titleHe,
      input.titleEn        ?? null,
      input.clientId,
      input.leadLawyerId   ?? null,
      input.judgeId        ?? null,
      input.courtName      ?? null,
      input.openedDate     ?? null,
      input.status         ?? 'open',
      input.notes          ?? null,
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, updates: Partial<CaseCreateInput>): Case | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const sets: string[]    = [];
    const params: unknown[] = [];

    if (updates.caseNumber   !== undefined) { sets.push('case_number = ?');    params.push(updates.caseNumber); }
    if (updates.caseType     !== undefined) { sets.push('case_type = ?');      params.push(updates.caseType); }
    if (updates.titleHe      !== undefined) { sets.push('title_he = ?');       params.push(updates.titleHe); }
    if (updates.titleEn      !== undefined) { sets.push('title_en = ?');       params.push(updates.titleEn); }
    if (updates.clientId     !== undefined) { sets.push('client_id = ?');      params.push(updates.clientId); }
    if (updates.leadLawyerId !== undefined) { sets.push('lead_lawyer_id = ?'); params.push(updates.leadLawyerId); }
    if (updates.judgeId      !== undefined) { sets.push('judge_id = ?');       params.push(updates.judgeId); }
    if (updates.courtName    !== undefined) { sets.push('court_name = ?');     params.push(updates.courtName); }
    if (updates.openedDate   !== undefined) { sets.push('opened_date = ?');    params.push(updates.openedDate); }
    if (updates.status       !== undefined) { sets.push('status = ?');         params.push(updates.status); }
    if (updates.notes        !== undefined) { sets.push('notes = ?');          params.push(updates.notes); }

    if (sets.length === 0) return existing;
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    params.push(id);

    this.db.prepare(`UPDATE Cases SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  }

  close(id: number): void {
    this.db.prepare(`
      UPDATE Cases
      SET status = 'closed',
          closed_date = date('now'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(id);
  }

  // ─────────────────────────────────────────────
  //  Mapping
  // ─────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): Case {
    return {
      id:           row['id'] as number,
      caseNumber:   row['case_number'] as string,
      caseType:     row['case_type'] as Case['caseType'],
      titleHe:      row['title_he'] as string,
      titleEn:      (row['title_en'] as string | null) ?? null,
      clientId:     row['client_id'] as number,
      leadLawyerId: (row['lead_lawyer_id'] as number | null) ?? null,
      judgeId:      (row['judge_id'] as number | null) ?? null,
      courtName:    (row['court_name'] as string | null) ?? null,
      openedDate:   (row['opened_date'] as string | null) ?? null,
      closedDate:   (row['closed_date'] as string | null) ?? null,
      status:       row['status'] as Case['status'],
      notes:        (row['notes'] as string | null) ?? null,
      createdAt:    row['created_at'] as string,
      updatedAt:    row['updated_at'] as string,
    };
  }
}
