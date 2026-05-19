import type { DatabaseConnection } from '../connection.js';
import type { Task, TaskCreateInput, TaskUpdateInput, TaskUrgency } from '@legal-os/shared';

function computeUrgency(dueDate: string | null, status: string): TaskUrgency {
  if (!dueDate || status === 'checked' || status === 'cancelled') return 'normal';
  const now  = Date.now();
  const due  = new Date(dueDate).getTime();
  const diff = due - now;
  if (diff < 0)            return 'critical';  // overdue
  if (diff < 48 * 3600_000) return 'warning';  // within 48 h
  return 'normal';
}

export class TaskRepository {
  constructor(private readonly db: DatabaseConnection) {}

  // ─────────────────────────────────────────────
  //  Read
  // ─────────────────────────────────────────────

  list(options: {
    status?:   string;
    clientId?: number;
    caseId?:   number;
    limit?:    number;
    page?:     number;
  } = {}): { items: Task[]; total: number; hasNextPage: boolean } {
    const { status, clientId, caseId, limit = 50, page = 1 } = options;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const args: unknown[]      = [];

    if (status)   { conditions.push('t.status = ?');    args.push(status);   }
    if (clientId) { conditions.push('t.client_id = ?'); args.push(clientId); }
    if (caseId)   { conditions.push('t.case_id = ?');   args.push(caseId);   }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (this.db.prepare(
      `SELECT COUNT(*) AS n FROM Tasks t ${where}`
    ).get(...args) as { n: number }).n;

    const rows = this.db.prepare(`
      SELECT t.*,
             c.name_he AS client_name
      FROM Tasks t
      LEFT JOIN Clients c ON c.id = t.client_id
      ${where}
      ORDER BY
        CASE t.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        CASE WHEN t.due_date IS NOT NULL THEN t.due_date ELSE '9999' END ASC,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as Record<string, unknown>[];

    return {
      items:       rows.map((r) => this.mapRow(r)),
      total,
      hasNextPage: total > page * limit,
    };
  }

  findById(id: number): Task | null {
    const row = this.db.prepare(`
      SELECT t.*, c.name_he AS client_name
      FROM Tasks t
      LEFT JOIN Clients c ON c.id = t.client_id
      WHERE t.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  /** Tasks completed in the last N days for a client. */
  completedByClient(clientId: number, days = 7): Task[] {
    const rows = this.db.prepare(`
      SELECT t.*, c.name_he AS client_name
      FROM Tasks t
      LEFT JOIN Clients c ON c.id = t.client_id
      WHERE t.client_id = ?
        AND t.status    = 'checked'
        AND t.updated_at >= datetime('now', ?)
      ORDER BY t.updated_at DESC
    `).all(clientId, `-${days} days`) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Active (non-complete) tasks for a client. */
  pendingByClient(clientId: number): Task[] {
    const rows = this.db.prepare(`
      SELECT t.*, c.name_he AS client_name
      FROM Tasks t
      LEFT JOIN Clients c ON c.id = t.client_id
      WHERE t.client_id = ?
        AND t.status IN ('pending','in_progress')
      ORDER BY
        CASE WHEN t.due_date IS NOT NULL THEN t.due_date ELSE '9999' END ASC,
        t.priority DESC
    `).all(clientId) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  // ─────────────────────────────────────────────
  //  Write
  // ─────────────────────────────────────────────

  create(input: TaskCreateInput): Task {
    const result = this.db.prepare(`
      INSERT INTO Tasks (title, description, status, priority, due_date,
                         client_id, case_id, document_id, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.title,
      input.description  ?? null,
      input.status       ?? 'pending',
      input.priority     ?? 'normal',
      input.dueDate      ?? null,
      input.clientId     ?? null,
      input.caseId       ?? null,
      input.documentId   ?? null,
      input.source       ?? 'manual',
    );
    return this.findById(result.lastInsertRowid as number)!;
  }

  update(id: number, input: TaskUpdateInput): Task | null {
    const fields: string[] = [];
    const args: unknown[]  = [];

    if (input.title       !== undefined) { fields.push('title = ?');       args.push(input.title); }
    if (input.description !== undefined) { fields.push('description = ?'); args.push(input.description); }
    if (input.status      !== undefined) { fields.push('status = ?');      args.push(input.status); }
    if (input.priority    !== undefined) { fields.push('priority = ?');    args.push(input.priority); }
    if (input.dueDate     !== undefined) { fields.push('due_date = ?');    args.push(input.dueDate); }
    if (input.caseId      !== undefined) { fields.push('case_id = ?');     args.push(input.caseId); }

    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    args.push(id);

    this.db.prepare(`UPDATE Tasks SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    return this.findById(id);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM Tasks WHERE id = ?').run(id);
  }

  // ─────────────────────────────────────────────
  //  Mapping
  // ─────────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): Task {
    const dueDate = (row['due_date'] as string | null) ?? null;
    const status  = row['status'] as string;
    return {
      id:          row['id'] as number,
      title:       row['title'] as string,
      description: (row['description'] as string | null) ?? null,
      status:      status as Task['status'],
      priority:    row['priority'] as Task['priority'],
      dueDate,
      urgency:     computeUrgency(dueDate, status),
      clientId:    (row['client_id'] as number | null) ?? null,
      clientName:  (row['client_name'] as string | null) ?? null,
      caseId:      (row['case_id'] as number | null) ?? null,
      documentId:  (row['document_id'] as number | null) ?? null,
      source:      row['source'] as Task['source'],
      createdAt:   row['created_at'] as string,
      updatedAt:   row['updated_at'] as string,
    };
  }
}
