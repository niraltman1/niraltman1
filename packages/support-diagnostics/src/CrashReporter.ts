/**
 * CrashReporter — persists crash reports to disk and exposes recent-crash queries.
 *
 * Reports are stored as individual JSON files under {dataPath}/reports/crashes/.
 * The directory is created on first write. Global process handlers can be installed
 * once at startup to capture uncaught exceptions and unhandled rejections automatically.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { currentTraceId } from '@factum-il/observability';
import type { CrashReport } from './types.js';
import { RedactionPipeline } from './RedactionPipeline.js';

export class CrashReporter {
  private readonly crashDir: string;

  constructor(
    private readonly dataPath: string,
    private readonly redaction: RedactionPipeline,
  ) {
    this.crashDir = join(dataPath, 'reports', 'crashes');
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Records a crash report to disk.
   * The message and stack are redacted of PII before writing.
   * Never throws — failures are silently swallowed to avoid masking the original error.
   */
  async recordCrash(
    partial: Omit<CrashReport, 'id' | 'occurredAt' | 'traceId'>,
  ): Promise<CrashReport> {
    const report: CrashReport = {
      id:          randomUUID(),
      occurredAt:  new Date().toISOString(),
      traceId:     currentTraceId() ?? 'no-trace',
      ...partial,
      message:     this.redaction.redactString(partial.message),
      stack:       partial.stack !== undefined
                     ? this.redaction.redactString(partial.stack)
                     : undefined,
      context:     this.redaction.redactObject(partial.context),
    };

    try {
      await mkdir(this.crashDir, { recursive: true });
      const filename = `crash-${report.occurredAt.replace(/[:.]/g, '-')}-${report.id}.json`;
      await writeFile(
        join(this.crashDir, filename),
        JSON.stringify(report, null, 2),
        'utf8',
      );
    } catch {
      // Non-fatal: if we can't write the report, carry on
    }

    return report;
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Returns crash reports that occurred within the given age window.
   * Files that cannot be parsed are skipped silently.
   */
  async getRecentCrashes(maxAgeHours = 72): Promise<CrashReport[]> {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1_000;

    let filenames: string[];
    try {
      filenames = await readdir(this.crashDir);
    } catch {
      // Directory may not exist if no crashes have been recorded
      return [];
    }

    const reports: CrashReport[] = [];

    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue;
      try {
        const raw = await readFile(join(this.crashDir, filename), 'utf8');
        const report = JSON.parse(raw) as CrashReport;
        if (new Date(report.occurredAt).getTime() >= cutoff) {
          reports.push(report);
        }
      } catch {
        // Skip unreadable / malformed files
      }
    }

    // Newest first
    reports.sort((a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return reports;
  }

  // -------------------------------------------------------------------------
  // Process-level handlers
  // -------------------------------------------------------------------------

  /**
   * Installs global `uncaughtException` and `unhandledRejection` handlers.
   * Call once at application startup.  Errors are recorded and then the process
   * exits with code 1 for uncaught exceptions (standard Node.js behaviour).
   */
  installProcessHandlers(source: CrashReport['source']): void {
    process.on('uncaughtException', (err: Error) => {
      void this.recordCrash({
        source,
        errorType:  err.name,
        message:    err.message,
        stack:      err.stack,
        context:    {},
        recovered:  false,
      }).finally(() => {
        process.exit(1);
      });
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      void this.recordCrash({
        source,
        errorType: err.name,
        message:   err.message,
        stack:     err.stack,
        context:   { unhandledRejection: true },
        recovered: false,
      });
    });
  }
}
