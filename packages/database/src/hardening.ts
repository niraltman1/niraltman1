import { logger, utcNow } from '@factum-il/shared';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { DatabaseConnection } from './connection.js';

const AGENT = 'DataArchitect';

export type WALCheckpointMode = 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';

export interface IntegrityReport {
  readonly integrityOk:     boolean;
  readonly foreignKeyErrors: string[];
  readonly walPages:        number;
  readonly databaseSizeBytes: number;
  readonly checkedAt:       string;
}

export interface BackupResult {
  readonly backupPath: string;
  readonly sizeBytes:  number;
  readonly createdAt:  string;
}

/**
 * Database hardening utilities: WAL checkpoint, integrity checks,
 * hot backup, and corruption detection.
 */
export class DatabaseHardening {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Runs a WAL checkpoint and records it in WALCheckpoints table.
   */
  checkpoint(mode: WALCheckpointMode = 'PASSIVE', triggeredBy = 'system'): void {
    const start = Date.now();
    let result: { busy: number; log: number; checkpointed: number } = { busy: 0, log: 0, checkpointed: 0 };

    try {
      const row = this.db.prepare(`PRAGMA wal_checkpoint(${mode})`).get() as {
        busy: number; log: number; checkpointed: number;
      };
      result = row;
    } catch (err) {
      logger.warn(`WAL checkpoint failed: ${String(err)}`, { category: 'system', agentSource: AGENT });
    }

    const durationMs = Date.now() - start;

    try {
      this.db.prepare(`
        INSERT INTO WALCheckpoints (mode, pages_written, pages_moved, triggered_by, duration_ms)
        VALUES (?, ?, ?, ?, ?)
      `).run(mode, result.log, result.checkpointed, triggeredBy, durationMs);
    } catch { /* WALCheckpoints table may not exist in early migration state */ }

    logger.info(`WAL checkpoint (${mode}): log=${result.log} checkpointed=${result.checkpointed} ms=${durationMs}`, {
      category: 'system', agentSource: AGENT,
    });
  }

  /**
   * Runs PRAGMA integrity_check and foreign_key_check.
   * Returns a structured integrity report.
   */
  checkIntegrity(): IntegrityReport {
    const integrityRows = this.db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    const integrityOk   = integrityRows.length === 1 && integrityRows[0]?.integrity_check === 'ok';

    const fkRows          = this.db.prepare('PRAGMA foreign_key_check').all() as Record<string, unknown>[];
    const foreignKeyErrors = fkRows.map((r) => JSON.stringify(r));

    const sizeRow = this.db.prepare('PRAGMA page_count').get() as { page_count: number };
    const pageSz  = this.db.prepare('PRAGMA page_size').get()  as { page_size: number };
    const walRow  = this.db.prepare('PRAGMA wal_autocheckpoint').get() as { wal_autocheckpoint: number };

    const report: IntegrityReport = {
      integrityOk,
      foreignKeyErrors,
      walPages:          walRow.wal_autocheckpoint,
      databaseSizeBytes: sizeRow.page_count * pageSz.page_size,
      checkedAt:         utcNow(),
    };

    if (!integrityOk) {
      logger.error(`Database integrity check FAILED: ${integrityRows.map((r) => r.integrity_check).join('; ')}`, {
        category: 'system', agentSource: AGENT,
      });
    } else {
      logger.info(`Database integrity OK (${report.databaseSizeBytes} bytes)`, {
        category: 'system', agentSource: AGENT,
      });
    }

    return report;
  }

  /**
   * Creates a hot backup by copying the database file.
   * Forces a WAL checkpoint first to minimise WAL divergence.
   */
  backup(backupDir: string): BackupResult {
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

    this.checkpoint('FULL', 'backup');

    const dbPath    = this.db.raw.name;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `factum-il-backup-${timestamp}.db`);

    copyFileSync(dbPath, backupPath);

    const { statSync } = require('node:fs') as typeof import('node:fs');
    const sizeBytes = statSync(backupPath).size;

    logger.info(`Database backup created: ${backupPath} (${sizeBytes} bytes)`, {
      category: 'system', agentSource: AGENT,
    });

    return { backupPath, sizeBytes, createdAt: utcNow() };
  }

  /**
   * Records a metric into the Metrics table.
   */
  recordMetric(
    metricName: string,
    value: number,
    unit: string,
    agent: string,
    documentId?: number,
    tags?: Record<string, unknown>,
  ): void {
    try {
      this.db.prepare(`
        INSERT INTO Metrics (metric_name, metric_value, unit, agent, document_id, tags_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        metricName,
        value,
        unit,
        agent,
        documentId ?? null,
        tags ? JSON.stringify(tags) : null,
      );
    } catch { /* Non-critical – never let metric writes crash the pipeline */ }
  }

  /**
   * Returns aggregated metrics for a given metric name over the last N hours.
   */
  getMetrics(metricName: string, hours = 24): { avg: number; min: number; max: number; count: number } {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const row = this.db.prepare(`
      SELECT AVG(metric_value) as avg, MIN(metric_value) as min,
             MAX(metric_value) as max, COUNT(*) as count
        FROM Metrics
       WHERE metric_name = ? AND recorded_at >= ?
    `).get(metricName, since) as { avg: number; min: number; max: number; count: number };
    return row;
  }
}
