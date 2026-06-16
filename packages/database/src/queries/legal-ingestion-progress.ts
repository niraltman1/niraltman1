import type { DatabaseConnection } from '../connection.js';

export type IngestionStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

export interface IngestionProgressRow {
  readonly id:           number;
  readonly sourceId:     string;
  readonly status:       IngestionStatus;
  readonly lastBatch:    number;
  readonly lastLine:     number;
  readonly totalLines:   number | null;
  readonly processed:    number;
  readonly rejected:     number;
  readonly duplicates:   number;
  readonly elapsedMs:    number;
  readonly errorMessage: string | null;
  readonly startedAt:    string | null;
  readonly completedAt:  string | null;
  readonly updatedAt:    string;
}

interface RawRow {
  id: number; source_id: string; status: string; last_batch: number; last_line: number;
  total_lines: number | null; processed: number; rejected: number; duplicates: number;
  elapsed_ms: number; error_message: string | null; started_at: string | null;
  completed_at: string | null; updated_at: string;
}

function toRow(r: RawRow): IngestionProgressRow {
  return {
    id:           r.id,
    sourceId:     r.source_id,
    status:       r.status as IngestionStatus,
    lastBatch:    r.last_batch,
    lastLine:     r.last_line,
    totalLines:   r.total_lines,
    processed:    r.processed,
    rejected:     r.rejected,
    duplicates:   r.duplicates,
    elapsedMs:    r.elapsed_ms,
    errorMessage: r.error_message,
    startedAt:    r.started_at,
    completedAt:  r.completed_at,
    updatedAt:    r.updated_at,
  };
}

export class LegalIngestionProgressRepository {
  constructor(private readonly db: DatabaseConnection) {}

  start(sourceId: string, totalLines?: number): IngestionProgressRow {
    this.db.prepare(`
      INSERT INTO LegalIngestionProgress (source_id, status, total_lines, started_at)
      VALUES (?, 'RUNNING', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(source_id) DO UPDATE SET
        status     = 'RUNNING',
        total_lines = COALESCE(excluded.total_lines, total_lines),
        started_at  = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        error_message = NULL,
        completed_at  = NULL,
        updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(sourceId, totalLines ?? null);
    return this.get(sourceId)!;
  }

  updateProgress(sourceId: string, opts: {
    lastBatch?:  number;
    lastLine?:   number;
    processed?:  number;
    rejected?:   number;
    duplicates?: number;
    elapsedMs?:  number;
  }): void {
    const sets: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
    const params: (string | number)[] = [];

    if (opts.lastBatch  !== undefined) { sets.push('last_batch  = ?'); params.push(opts.lastBatch); }
    if (opts.lastLine   !== undefined) { sets.push('last_line   = ?'); params.push(opts.lastLine); }
    if (opts.processed  !== undefined) { sets.push('processed   = ?'); params.push(opts.processed); }
    if (opts.rejected   !== undefined) { sets.push('rejected    = ?'); params.push(opts.rejected); }
    if (opts.duplicates !== undefined) { sets.push('duplicates  = ?'); params.push(opts.duplicates); }
    if (opts.elapsedMs  !== undefined) { sets.push('elapsed_ms  = ?'); params.push(opts.elapsedMs); }

    params.push(sourceId);
    this.db.prepare(
      `UPDATE LegalIngestionProgress SET ${sets.join(', ')} WHERE source_id = ?`,
    ).run(...params);
  }

  complete(sourceId: string): void {
    this.db.prepare(`
      UPDATE LegalIngestionProgress SET
        status       = 'COMPLETED',
        completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE source_id = ?
    `).run(sourceId);
  }

  fail(sourceId: string, errorMessage: string): void {
    this.db.prepare(`
      UPDATE LegalIngestionProgress SET
        status        = 'FAILED',
        error_message = ?,
        updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE source_id = ?
    `).run(errorMessage.slice(0, 500), sourceId);
  }

  reset(sourceId: string): void {
    this.db.prepare(`
      UPDATE LegalIngestionProgress SET
        status = 'IDLE', last_batch = 0, last_line = 0, processed = 0,
        rejected = 0, duplicates = 0, elapsed_ms = 0, error_message = NULL,
        started_at = NULL, completed_at = NULL,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE source_id = ?
    `).run(sourceId);
  }

  get(sourceId: string): IngestionProgressRow | null {
    const raw = this.db.prepare(
      'SELECT * FROM LegalIngestionProgress WHERE source_id = ?',
    ).get(sourceId) as RawRow | undefined;
    return raw ? toRow(raw) : null;
  }

  listInterrupted(): IngestionProgressRow[] {
    return (this.db.prepare(
      "SELECT * FROM LegalIngestionProgress WHERE status = 'RUNNING'",
    ).all() as RawRow[]).map(toRow);
  }
}
