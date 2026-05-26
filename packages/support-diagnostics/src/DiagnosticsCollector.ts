/**
 * DiagnosticsCollector — orchestrates all diagnostic data collection.
 *
 * collectBundle()  → full SupportBundle including API health call
 * runChecks()      → offline-only DiagnosticCheck[] (no network calls)
 *
 * Architecture:
 *   1. Generate trace ID
 *   2. Collect environment / system snapshot (offline)
 *   3. Hit GET {apiBaseUrl}/api/health (graceful failure, 5 s timeout)
 *   4. Read recent crash files from disk
 *   5. Read last 200 lines of the latest log file
 *   6. Extract WARN/ERROR lines as recentWarnings
 *   7. Build and return SupportBundle
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { generateTraceId } from '@factum-il/observability';
import { generateUUID } from '@factum-il/shared';
import type {
  SupportBundle,
  DiagnosticCheck,
  DiagnosticSeverity,
  AgentExecutionSummary,
  PipelineSummary,
  MigrationState,
} from './types.js';
import { EnvironmentSnapshot } from './EnvironmentSnapshot.js';
import { CrashReporter } from './CrashReporter.js';
import { RedactionPipeline } from './RedactionPipeline.js';
import type { DiagnosticsOptions } from './types.js';

// Shape of the /api/health response (only fields we care about)
interface HealthResponse {
  ok?: boolean;
  ts?: number;
  ai_ready?: boolean;
  version?: string;
  checks?: {
    db?:         { healthy?: boolean; detail?: string; durationMs?: number };
    migrations?: { healthy?: boolean; detail?: string; durationMs?: number };
    ollama?:     { healthy?: boolean; detail?: string; durationMs?: number };
    queue?:      { healthy?: boolean; detail?: string; durationMs?: number };
    disk?:       { healthy?: boolean; detail?: string; durationMs?: number };
  };
}

export class DiagnosticsCollector {
  private readonly opts: Required<DiagnosticsOptions>;
  private readonly envSnapshot: EnvironmentSnapshot;
  private readonly redaction: RedactionPipeline;

  constructor(opts: DiagnosticsOptions = {}) {
    this.opts = {
      apiBaseUrl:  opts.apiBaseUrl  ?? 'http://localhost:3001',
      factumRoot:  opts.factumRoot  ?? process.env['FACTUM_IL_ROOT']      ?? '',
      dataPath:    opts.dataPath    ?? process.env['FACTUM_IL_DATA_PATH']  ?? '',
      maxCrashAge: opts.maxCrashAge ?? 72,
    };
    this.envSnapshot = new EnvironmentSnapshot();
    this.redaction   = RedactionPipeline.getInstance();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Assembles a complete SupportBundle. May make a network call to the local API. */
  async collectBundle(): Promise<SupportBundle> {
    const traceId     = generateTraceId();
    const bundleId    = generateUUID();
    const generatedAt = new Date().toISOString();

    // Parallel collection of independent data sources
    const [systemSnapshot, healthData, recentCrashes, logLines] = await Promise.all([
      Promise.resolve(this.envSnapshot.collect(traceId)),
      this._fetchHealth(),
      this._loadRecentCrashes(),
      this._readRecentLogLines(200),
    ]);

    const modelInfo = this.envSnapshot.collectModelInfo();
    modelInfo.ollamaReachable = healthData?.checks?.ollama?.healthy ?? false;

    const installerDiagnostics = this.envSnapshot.collectInstallerDiagnostics();
    const environmentVars      = this.envSnapshot.collectSafeEnvVars();

    // Build DiagnosticChecks from health endpoint data
    const checks: DiagnosticCheck[] = this._healthToChecks(healthData);

    // Determine overall severity
    const overallSeverity = this._computeOverallSeverity(checks);

    // Extract WARN / ERROR lines as recentWarnings (redacted)
    const recentWarnings = logLines
      .filter((line) => /\b(WARN|ERROR|FATAL)\b/i.test(line))
      .map((line) => this.redaction.redactString(line))
      .slice(0, 50);

    // Migration state from health checks
    const migrations: MigrationState = this._extractMigrationState(healthData);

    // Agent and pipeline summaries (best-effort from health response)
    const agent:    AgentExecutionSummary = this._emptyAgentSummary();
    const pipeline: PipelineSummary       = this._emptyPipelineSummary();

    return {
      bundleId,
      generatedAt,
      system:    systemSnapshot,
      model:     modelInfo,
      migrations,
      health: {
        overall: overallSeverity,
        checks,
      },
      agent,
      pipeline,
      recentCrashes,
      recentWarnings,
      environmentVars,
      installerDiagnostics,
    };
  }

  /**
   * Runs offline-only checks (no API calls) and returns structured results.
   * Useful for a quick local health check before the API is up.
   */
  async runChecks(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];

    // 1. Crash directory writable?
    checks.push(await this._checkCrashDirWritable());

    // 2. Log directory exists?
    checks.push(await this._checkLogDirExists());

    // 3. GGUF model present?
    checks.push(this._checkModelPresent());

    // 4. Data path configured?
    checks.push(this._checkDataPathConfigured());

    return checks;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — network
  // ---------------------------------------------------------------------------

  private async _fetchHealth(): Promise<HealthResponse | null> {
    const url = `${this.opts.apiBaseUrl}/api/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return (await res.json()) as HealthResponse;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // API not running — not a fatal error for diagnostics
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — crash reports
  // ---------------------------------------------------------------------------

  private async _loadRecentCrashes(): Promise<SupportBundle['recentCrashes']> {
    const reporter = new CrashReporter(this.opts.dataPath, this.redaction);
    return reporter.getRecentCrashes(this.opts.maxCrashAge);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — log lines
  // ---------------------------------------------------------------------------

  private async _readRecentLogLines(maxLines: number): Promise<string[]> {
    try {
      const localAppData = process.env['LOCALAPPDATA'] ?? process.env['HOME'] ?? '';
      const logDir = join(localAppData, 'FactumIL', 'logs');

      const entries = await readdir(logDir);
      // Find .log files, sort by mtime descending
      const logFiles = entries.filter((f) => f.endsWith('.log'));
      if (logFiles.length === 0) return [];

      // Pick the most recently modified log file
      const withMtimes = await Promise.all(
        logFiles.map(async (f) => {
          const s = await stat(join(logDir, f)).catch(() => null);
          return { name: f, mtime: s?.mtimeMs ?? 0 };
        }),
      );
      withMtimes.sort((a, b) => b.mtime - a.mtime);
      const latestFile = withMtimes[0]?.name;
      if (latestFile === undefined) return [];

      const content = await readFile(join(logDir, latestFile), 'utf8');
      const lines = content.split('\n').filter(Boolean);
      return lines.slice(-maxLines);
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — data transformation
  // ---------------------------------------------------------------------------

  private _healthToChecks(health: HealthResponse | null): DiagnosticCheck[] {
    if (health === null) {
      return [
        {
          name:    'api',
          status:  'unknown',
          message: 'שרת ה-API אינו זמין — הנתונים מוגבלים לאבחון מקומי בלבד',
        },
      ];
    }

    const checks: DiagnosticCheck[] = [];
    const hc = health.checks ?? {};

    const addCheck = (
      name: string,
      entry: { healthy?: boolean; detail?: string; durationMs?: number } | undefined,
      hebrewLabel: string,
    ): void => {
      if (entry === undefined) return;
      checks.push({
        name,
        status:     entry.healthy ? 'ok' : 'critical',
        message:    entry.healthy
          ? `${hebrewLabel}: תקין`
          : `${hebrewLabel}: תקלה — ${entry.detail ?? 'לא ידוע'}`,
        details:    entry.detail !== undefined ? { detail: entry.detail } : undefined,
        durationMs: entry.durationMs,
      });
    };

    addCheck('db',         hc.db,         'מסד נתונים');
    addCheck('migrations', hc.migrations,  'מיגרציות');
    addCheck('ollama',     hc.ollama,      'מודל AI');
    addCheck('queue',      hc.queue,       'תור עיבוד');
    addCheck('disk',       hc.disk,        'מקום בדיסק');

    if (health.ai_ready !== undefined) {
      checks.push({
        name:    'ai_ready',
        status:  health.ai_ready ? 'ok' : 'warn',
        message: health.ai_ready ? 'מודל AI מוכן' : 'מודל AI אינו מוכן',
      });
    }

    return checks;
  }

  private _computeOverallSeverity(checks: DiagnosticCheck[]): DiagnosticSeverity {
    if (checks.some((c) => c.status === 'critical')) return 'critical';
    if (checks.some((c) => c.status === 'warn'))     return 'warn';
    if (checks.some((c) => c.status === 'unknown'))  return 'unknown';
    if (checks.length === 0)                         return 'unknown';
    return 'ok';
  }

  private _extractMigrationState(health: HealthResponse | null): MigrationState {
    const detail = health?.checks?.migrations?.detail ?? '';
    // detail format: "current=37 expected>=37"
    const currentMatch = /current=(\d+)/.exec(detail);
    const expectedMatch = /expected>=(\d+)/.exec(detail);

    const appliedCount   = currentMatch   ? parseInt(currentMatch[1]!,  10) : 0;
    const expectedMinimum = expectedMatch ? parseInt(expectedMatch[1]!, 10) : 0;

    return {
      appliedCount,
      lastMigration:   appliedCount > 0 ? String(appliedCount) : null,
      expectedMinimum,
      healthy:         health?.checks?.migrations?.healthy ?? false,
    };
  }

  private _emptyAgentSummary(): AgentExecutionSummary {
    return {
      recentFailures:    0,
      recentSuccesses:   0,
      lastFailureAt:     null,
      lastFailureReason: null,
    };
  }

  private _emptyPipelineSummary(): PipelineSummary {
    return {
      pendingCount:    0,
      failedCount:     0,
      lastProcessedAt: null,
      errorRate:       0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — offline checks
  // ---------------------------------------------------------------------------

  private async _checkCrashDirWritable(): Promise<DiagnosticCheck> {
    const start = Date.now();
    if (!this.opts.dataPath) {
      return {
        name:      'crash_dir',
        status:    'warn',
        message:   'FACTUM_IL_DATA_PATH לא מוגדר — לא ניתן לאמת ספריית דוחות',
        durationMs: Date.now() - start,
      };
    }
    try {
      const { mkdir: mkd } = await import('node:fs/promises');
      await mkd(join(this.opts.dataPath, 'reports', 'crashes'), { recursive: true });
      return {
        name:      'crash_dir',
        status:    'ok',
        message:   'ספריית דוחות נגישה',
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        name:      'crash_dir',
        status:    'critical',
        message:   `ספריית דוחות אינה נגישה: ${String(err)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private async _checkLogDirExists(): Promise<DiagnosticCheck> {
    const start = Date.now();
    const localAppData = process.env['LOCALAPPDATA'] ?? process.env['HOME'] ?? '';
    const logDir = join(localAppData, 'FactumIL', 'logs');
    try {
      await stat(logDir);
      return {
        name:      'log_dir',
        status:    'ok',
        message:   `ספריית לוגים קיימת: ${logDir}`,
        durationMs: Date.now() - start,
      };
    } catch {
      return {
        name:      'log_dir',
        status:    'warn',
        message:   `ספריית לוגים אינה קיימת: ${logDir}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private _checkModelPresent(): DiagnosticCheck {
    const modelInfo = this.envSnapshot.collectModelInfo();
    return {
      name:    'model_file',
      status:  modelInfo.present ? 'ok' : 'warn',
      message: modelInfo.present
        ? `קובץ מודל AI נמצא: ${modelInfo.ggufPath ?? ''}`
        : 'קובץ מודל AI לא נמצא במסלול הצפוי',
      details: {
        required:  modelInfo.required,
        ggufPath:  modelInfo.ggufPath ?? null,
      },
    };
  }

  private _checkDataPathConfigured(): DiagnosticCheck {
    const configured = Boolean(this.opts.dataPath);
    return {
      name:    'data_path',
      status:  configured ? 'ok' : 'warn',
      message: configured
        ? `נתיב נתונים מוגדר: ${this.opts.dataPath}`
        : 'FACTUM_IL_DATA_PATH לא מוגדר',
    };
  }
}
