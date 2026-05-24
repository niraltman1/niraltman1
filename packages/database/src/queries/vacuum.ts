import type { DatabaseConnection } from '../connection.js';

export type VacuumStatus =
  | 'pending'
  | 'discovery'
  | 'processing_ocr'
  | 'locking_evidence'
  | 'indexing_ai'
  | 'completed'
  | 'failed';

export interface VacuumSession {
  readonly id:                 number;
  readonly sessionUuid:        string;
  readonly targetPath:         string;
  readonly status:             VacuumStatus;
  readonly progressPercentage: number;
  readonly currentStepText:    string | null;
  readonly rawLogs:            string;
  readonly startedAt:          string;
  readonly updatedAt:          string;
  readonly completedAt:        string | null;
}

const NOW = () => new Date().toISOString();

function mapRow(r: Record<string, unknown>): VacuumSession {
  return {
    id:                 r['id'] as number,
    sessionUuid:        r['session_uuid'] as string,
    targetPath:         r['target_path'] as string,
    status:             r['status'] as VacuumStatus,
    progressPercentage: r['progress_percentage'] as number,
    currentStepText:    r['current_step_text'] as string | null,
    rawLogs:            r['raw_logs'] as string,
    startedAt:          r['started_at'] as string,
    updatedAt:          r['updated_at'] as string,
    completedAt:        r['completed_at'] as string | null,
  };
}

export class VacuumRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(targetPath: string): VacuumSession {
    const now = NOW();
    const result = this.db.prepare(`
      INSERT INTO VacuumSessions (target_path, started_at, updated_at)
      VALUES (@targetPath, @now, @now)
    `).run({ targetPath, now }) as { lastInsertRowid: number | bigint };

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): VacuumSession | null {
    const row = this.db
      .prepare('SELECT * FROM VacuumSessions WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  updateProgress(
    id: number,
    status: VacuumStatus,
    pct: number,
    stepText: string,
    logLine: string,
  ): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE VacuumSessions
         SET status              = @status,
             progress_percentage = @pct,
             current_step_text   = @stepText,
             raw_logs            = raw_logs || @logLine,
             updated_at          = @now
       WHERE id = @id
    `).run({ id, status, pct, stepText, logLine, now });
  }

  markFailed(id: number, errorMsg: string): void {
    const now = NOW();
    const line = `[${now}] ERROR: ${errorMsg}\n`;
    this.db.prepare(`
      UPDATE VacuumSessions
         SET status              = 'failed',
             current_step_text   = @errorMsg,
             raw_logs            = raw_logs || @line,
             updated_at          = @now
       WHERE id = @id
    `).run({ id, errorMsg, line, now });
  }

  listRecent(limit = 20): VacuumSession[] {
    const rows = this.db
      .prepare('SELECT * FROM VacuumSessions ORDER BY started_at DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }
}
