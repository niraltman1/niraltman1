import type { DatabaseConnection } from '../connection.js';

/**
 * Call documentation (C6). A logged phone call — no live recording; the summary is typed or
 * dictated (Whisper). Lives in the communications timeline (client-scoped); promoted into a
 * case timeline only via saveAsEvidence (is_evidence + case_id), per the owner's directive.
 */

export type CallDirection = 'inbound' | 'outbound';

export interface CallLog {
  id:              number;
  clientId:        number;
  caseId:          number | null;
  isEvidence:      boolean;
  direction:       CallDirection;
  subject:         string | null;
  summary:         string | null;
  occurredAt:      string;
  durationMinutes: number | null;
  participants:    string[];
  tags:            string[];
  createdBy:       number | null;
  createdAt:       string;
}

export interface CallLogCreateInput {
  clientId:         number;
  caseId?:          number | null;
  direction?:       CallDirection;
  subject?:         string | null;
  summary?:         string | null;
  occurredAt?:      string;            // defaults to now
  durationMinutes?: number | null;
  participants?:    string[];
  tags?:            string[];
  createdBy?:       number | null;
}

export interface CallLogPatch {
  subject?:         string | null;
  summary?:         string | null;
  direction?:       CallDirection;
  occurredAt?:      string;
  durationMinutes?: number | null;
  participants?:    string[];
  tags?:            string[];
}

function parseArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

function mapRow(r: Record<string, unknown>): CallLog {
  return {
    id:              r['id'] as number,
    clientId:        r['client_id'] as number,
    caseId:          (r['case_id'] as number | null) ?? null,
    isEvidence:      Number(r['is_evidence']) === 1,
    direction:       r['direction'] as CallDirection,
    subject:         (r['subject'] as string | null) ?? null,
    summary:         (r['summary'] as string | null) ?? null,
    occurredAt:      r['occurred_at'] as string,
    durationMinutes: (r['duration_minutes'] as number | null) ?? null,
    participants:    parseArray(r['participants']),
    tags:            parseArray(r['tags']),
    createdBy:       (r['created_by'] as number | null) ?? null,
    createdAt:       r['created_at'] as string,
  };
}

export class CallLogsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(input: CallLogCreateInput): CallLog {
    const res = this.db.prepare(`
      INSERT INTO CallLogs
        (client_id, case_id, direction, subject, summary, occurred_at, duration_minutes, participants, tags, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.clientId,
      input.caseId ?? null,
      input.direction ?? 'inbound',
      input.subject ?? null,
      input.summary ?? null,
      input.occurredAt ?? new Date().toISOString(),
      input.durationMinutes ?? null,
      JSON.stringify(input.participants ?? []),
      JSON.stringify(input.tags ?? []),
      input.createdBy ?? null,
    );
    return this.get(Number(res.lastInsertRowid))!;
  }

  get(id: number): CallLog | null {
    const r = this.db.prepare('SELECT * FROM CallLogs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? mapRow(r) : null;
  }

  listByClient(clientId: number, limit = 200): CallLog[] {
    const cap = Math.min(limit, 500);
    return (this.db.prepare('SELECT * FROM CallLogs WHERE client_id = ? ORDER BY occurred_at DESC LIMIT ?')
      .all(clientId, cap) as Record<string, unknown>[]).map(mapRow);
  }

  listByCase(caseId: number, limit = 200): CallLog[] {
    const cap = Math.min(limit, 500);
    return (this.db.prepare('SELECT * FROM CallLogs WHERE case_id = ? ORDER BY occurred_at DESC LIMIT ?')
      .all(caseId, cap) as Record<string, unknown>[]).map(mapRow);
  }

  update(id: number, patch: CallLogPatch): CallLog | null {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.subject         !== undefined) { sets.push('subject = ?');          params.push(patch.subject); }
    if (patch.summary         !== undefined) { sets.push('summary = ?');          params.push(patch.summary); }
    if (patch.direction       !== undefined) { sets.push('direction = ?');        params.push(patch.direction); }
    if (patch.occurredAt      !== undefined) { sets.push('occurred_at = ?');      params.push(patch.occurredAt); }
    if (patch.durationMinutes !== undefined) { sets.push('duration_minutes = ?'); params.push(patch.durationMinutes); }
    if (patch.participants    !== undefined) { sets.push('participants = ?');     params.push(JSON.stringify(patch.participants)); }
    if (patch.tags            !== undefined) { sets.push('tags = ?');             params.push(JSON.stringify(patch.tags)); }
    if (sets.length === 0) return this.get(id);
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    this.db.prepare(`UPDATE CallLogs SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    return this.get(id);
  }

  /** Promote a call into a case timeline (sets case_id + is_evidence). */
  saveAsEvidence(id: number, caseId: number): CallLog | null {
    this.db.prepare(
      "UPDATE CallLogs SET case_id = ?, is_evidence = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(caseId, id);
    return this.get(id);
  }
}
