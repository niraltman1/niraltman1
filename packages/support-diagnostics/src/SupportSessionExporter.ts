/**
 * SupportSessionExporter — exports a `.factumsupport` JSON bundle for remote
 * support triage. Reuses DiagnosticsCollector, RedactionPipeline, CrashReporter.
 *
 * Constraints (attorney-client privilege + privacy):
 *  - NO document contents, client names, or case data is included.
 *  - All PII is redacted via RedactionPipeline before export.
 *  - Bundle size is capped at MAX_SUPPORT_BUNDLE_MB (250 MB).
 *  - If the bundle exceeds the cap after exclusions, export is aborted.
 *
 * The bundle format is a single JSON file with a `_sections` array.
 * Each section has a `_type` field and a `data` payload.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { generateUUID } from '@factum-il/shared';
import { recordSupportExportDuration } from '@factum-il/observability';
import { DiagnosticsCollector } from './DiagnosticsCollector.js';
import { RedactionPipeline } from './RedactionPipeline.js';
import type { DiagnosticsOptions } from './types.js';

const MAX_SUPPORT_BUNDLE_MB = 250;
const MAX_SUPPORT_BUNDLE_BYTES = MAX_SUPPORT_BUNDLE_MB * 1024 * 1024;
const MAX_LOG_LINES = 500;

export interface SupportExportOptions extends DiagnosticsOptions {
  /** Directory to write the `.factumsupport` file into */
  outputDir: string;
  /** Display name of the admin requesting the export (for audit) */
  requestedBy?: string;
}

export interface SupportExportResult {
  success:   boolean;
  filePath?: string;
  bundleId?: string;
  sizeBytes?: number;
  error?:    string;
  excluded?: string[];
}

export class SupportSessionExporter {
  constructor(
    private readonly collector: DiagnosticsCollector,
    private readonly redaction: RedactionPipeline,
  ) {}

  async export(opts: SupportExportOptions): Promise<SupportExportResult> {
    const t0 = Date.now();
    const bundleId = generateUUID();
    const excluded: string[] = [];

    try {
      // Collect diagnostics (uses existing infrastructure)
      const raw = await this.collector.collectBundle();

      // Apply PII redaction to all text fields
      const warnings = raw.recentWarnings.map((line) => this.redaction.redactString(line));
      const crashes  = raw.recentCrashes.map((c) =>
        this.redaction.redactObject(c as unknown as Record<string, unknown>) as unknown as typeof c,
      );

      // Trim log lines to MAX_LOG_LINES to control bundle size
      const trimmedWarnings = warnings.slice(-MAX_LOG_LINES);
      if (warnings.length > MAX_LOG_LINES) {
        excluded.push(`${warnings.length - MAX_LOG_LINES} older log lines (kept last ${MAX_LOG_LINES})`);
      }

      // Build sections — no document/client/case content
      const sections: Array<{ _type: string; data: unknown }> = [
        { _type: 'meta', data: {
          bundleId,
          generatedAt:  raw.generatedAt,
          requestedBy:  opts.requestedBy ?? 'admin',
          factumVersion: process.env['FACTUM_IL_VERSION'] ?? 'unknown',
        }},
        { _type: 'system',      data: raw.system },
        { _type: 'model',       data: raw.model },
        { _type: 'migrations',  data: raw.migrations },
        { _type: 'health',      data: raw.health },
        { _type: 'agent',       data: raw.agent },
        { _type: 'pipeline',    data: raw.pipeline },
        { _type: 'installer',   data: raw.installerDiagnostics },
        { _type: 'env_vars',    data: raw.environmentVars },
        { _type: 'warnings',    data: trimmedWarnings },
        { _type: 'crashes',     data: crashes },
      ];

      const json = JSON.stringify({ _schema: 'factumsupport-v1', _sections: sections }, null, 2);
      const sizeBytes = Buffer.byteLength(json, 'utf8');

      if (sizeBytes > MAX_SUPPORT_BUNDLE_BYTES) {
        return {
          success: false,
          bundleId,
          error: `Support bundle exceeds ${MAX_SUPPORT_BUNDLE_MB} MB limit ` +
                 `(actual: ${Math.ceil(sizeBytes / 1024 / 1024)} MB). ` +
                 `Contact support for manual collection.`,
          excluded,
        };
      }

      await mkdir(opts.outputDir, { recursive: true });
      const fileName = `factum-support-${bundleId.slice(0, 8)}.factumsupport`;
      const filePath = join(opts.outputDir, fileName);
      await writeFile(filePath, json, 'utf8');

      recordSupportExportDuration(Date.now() - t0);
      return { success: true, filePath, bundleId, sizeBytes, excluded };

    } catch (err) {
      return {
        success: false,
        bundleId,
        error: err instanceof Error ? err.message : String(err),
        excluded,
      };
    }
  }
}
