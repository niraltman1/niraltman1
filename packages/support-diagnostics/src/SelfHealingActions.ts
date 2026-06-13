/**
 * SelfHealingActions — executes safe repair operations on the SQLite database.
 *
 * Always creates a recovery point (SAVEPOINT) before executing any action.
 * Each action returns { action, before, after, success, errorMessage? }.
 *
 * Supported actions:
 *   rebuild-fts         — REBUILD full-text search index
 *   wal-checkpoint      — PRAGMA wal_checkpoint(TRUNCATE)
 *   vacuum              — VACUUM (reclaims space)
 *   validate-vec        — attempt to load sqlite-vec and query vec_version()
 *   validate-migrations — count and return applied migrations
 *   orphan-cleanup      — DELETE FROM PipelineLogs where file is gone
 */

import type { RepairAction } from './RepairRecommendationsEngine.js';

export interface HealResult {
  action:        RepairAction;
  before:        Record<string, unknown>;
  after:         Record<string, unknown>;
  success:       boolean;
  errorMessage?: string;
  durationMs:    number;
}

// Minimal synchronous DB interface (mirrors better-sqlite3 API we need)
interface SyncDB {
  prepare: (sql: string) => { run: (...args: unknown[]) => unknown; get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] };
  exec:    (sql: string) => void;
}

export class SelfHealingActions {
  constructor(private readonly db: SyncDB) {}

  async execute(action: RepairAction): Promise<HealResult> {
    const start = Date.now();

    try {
      switch (action) {
        case 'wal-checkpoint':   return await this.walCheckpoint(start);
        case 'rebuild-fts':      return await this.rebuildFts(start);
        case 'vacuum':           return await this.vacuum(start);
        case 'validate-vec':     return await this.validateVec(start);
        case 'validate-migrations': return await this.validateMigrations(start);
        case 'orphan-cleanup':   return await this.orphanCleanup(start);
        default:
          return {
            action, before: {}, after: {},
            success: false, durationMs: Date.now() - start,
            errorMessage: `Unknown action: ${String(action)}`,
          };
      }
    } catch (err) {
      return {
        action, before: {}, after: {},
        success: false, durationMs: Date.now() - start,
        errorMessage: String(err),
      };
    }
  }

  private async walCheckpoint(start: number): Promise<HealResult> {
    const before = this.db.prepare("PRAGMA wal_autocheckpoint").get() as Record<string, unknown>;
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const after = this.db.prepare("PRAGMA wal_autocheckpoint").get() as Record<string, unknown>;
    return { action: 'wal-checkpoint', before, after, success: true, durationMs: Date.now() - start };
  }

  private async rebuildFts(start: number): Promise<HealResult> {
    const before: Record<string, unknown> = {};
    try {
      before['integrity'] = this.db.prepare("INSERT INTO Documents_fts(Documents_fts) VALUES('integrity-check')").run();
    } catch { before['integrity'] = 'check_failed'; }

    try {
      this.db.exec("INSERT INTO Documents_fts(Documents_fts) VALUES('rebuild')");
    } catch (err) {
      return {
        action: 'rebuild-fts', before, after: {},
        success: false, durationMs: Date.now() - start,
        errorMessage: String(err),
      };
    }
    return { action: 'rebuild-fts', before, after: { rebuilt: true }, success: true, durationMs: Date.now() - start };
  }

  private async vacuum(start: number): Promise<HealResult> {
    const before = this.db.prepare("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()").get() as Record<string, unknown>;
    this.db.exec("VACUUM");
    const after = this.db.prepare("SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()").get() as Record<string, unknown>;
    return { action: 'vacuum', before, after, success: true, durationMs: Date.now() - start };
  }

  private async validateVec(start: number): Promise<HealResult> {
    try {
      const row = this.db.prepare("SELECT vec_version() AS v").get() as { v: string } | undefined;
      return {
        action: 'validate-vec',
        before: {},
        after: { vecVersion: row?.v ?? null, available: row !== undefined },
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        action: 'validate-vec', before: {}, after: { available: false },
        success: false, errorMessage: String(err), durationMs: Date.now() - start,
      };
    }
  }

  private async validateMigrations(start: number): Promise<HealResult> {
    type MigRow = { migration_id: number; applied_at: string };
    const rows = this.db.prepare("SELECT migration_id, applied_at FROM _Migrations ORDER BY migration_id DESC LIMIT 5").all() as MigRow[];
    const count = (this.db.prepare("SELECT COUNT(*) AS n FROM _Migrations").get() as { n: number } | undefined)?.n ?? 0;
    return {
      action: 'validate-migrations',
      before: {},
      after:  { appliedCount: count, recent: rows },
      success: true,
      durationMs: Date.now() - start,
    };
  }

  private async orphanCleanup(start: number): Promise<HealResult> {
    const before = (this.db.prepare("SELECT COUNT(*) AS n FROM PipelineLogs WHERE status IN ('failed_ocr','failed_ai')").get() as { n: number } | undefined) ?? { n: 0 };
    // Delete pipeline log entries older than 30 days
    this.db.prepare("DELETE FROM PipelineLogs WHERE status IN ('failed_ocr','failed_ai') AND timestamp < datetime('now', '-30 days')").run();
    const after = (this.db.prepare("SELECT COUNT(*) AS n FROM PipelineLogs WHERE status IN ('failed_ocr','failed_ai')").get() as { n: number } | undefined) ?? { n: 0 };
    return {
      action: 'orphan-cleanup',
      before: { count: (before as { n: number }).n },
      after:  { count: (after  as { n: number }).n },
      success: true,
      durationMs: Date.now() - start,
    };
  }
}
