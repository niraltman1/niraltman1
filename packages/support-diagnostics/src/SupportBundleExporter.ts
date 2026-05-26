/**
 * SupportBundleExporter — writes a SupportBundle to disk in two formats:
 *
 *   1. exportToDirectory()  → structured folder with individual JSON files
 *      Output: {outputDir}/factum-support-YYYYMMDD-HHMM/
 *        ├── 00-bundle-meta.json
 *        ├── 01-system.json
 *        ├── 02-model.json
 *        ├── 03-migrations.json
 *        ├── 04-health.json
 *        ├── 05-agent.json
 *        ├── 06-pipeline.json
 *        ├── 07-recent-crashes.json
 *        ├── 08-recent-warnings.json
 *        ├── 09-environment-vars.json
 *        ├── 10-installer.json
 *        └── README.txt
 *
 *   2. exportToNDJSON()     → single NDJSON file (one JSON object per line)
 *      Each line has a `_section` field identifying the slice.
 *      Claude Code can read this directly for automated root-cause analysis.
 *
 * No external npm packages — Node.js built-ins only.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SupportBundle } from './types.js';

const README_CONTENT = `Factum-IL Support Bundle
========================

This folder was generated automatically by Factum-IL for beta support triage.

Files
-----
00-bundle-meta.json     Bundle ID, generation timestamp
01-system.json          OS, Node version, memory, paths
02-model.json           AI model availability (BrainboxAI/law-il-E2B:Q4_K_M)
03-migrations.json      Database migration state
04-health.json          API health check results
05-agent.json           Agent execution summary (recent failures/successes)
06-pipeline.json        Document pipeline summary
07-recent-crashes.json  Crash reports from the last 72 hours (PII redacted)
08-recent-warnings.json Recent WARN/ERROR log lines (PII redacted)
09-environment-vars.json Safe environment variables (no secrets)
10-installer.json       Installer / WebView2 / Ollama presence

Privacy
-------
All personally identifiable information (Israeli ID numbers, emails, phone
numbers, file paths with client names) has been automatically redacted before
export.  No document content, client names, or case details are included.

How to share
------------
Zip this folder and attach it to your support ticket.
`;

export class SupportBundleExporter {
  constructor(private readonly outputDir: string) {}

  // ---------------------------------------------------------------------------
  // Directory export
  // ---------------------------------------------------------------------------

  /**
   * Writes the bundle as a structured folder of JSON files.
   * Returns the absolute path of the created folder.
   */
  async exportToDirectory(bundle: SupportBundle): Promise<string> {
    const datePart = this._dateStamp(bundle.generatedAt);
    const folderName = `factum-support-${datePart}`;
    const folderPath = join(this.outputDir, folderName);

    await mkdir(folderPath, { recursive: true });

    const sections: Array<[string, unknown]> = [
      ['00-bundle-meta',      { bundleId: bundle.bundleId, generatedAt: bundle.generatedAt }],
      ['01-system',           bundle.system],
      ['02-model',            bundle.model],
      ['03-migrations',       bundle.migrations],
      ['04-health',           bundle.health],
      ['05-agent',            bundle.agent],
      ['06-pipeline',         bundle.pipeline],
      ['07-recent-crashes',   bundle.recentCrashes],
      ['08-recent-warnings',  bundle.recentWarnings],
      ['09-environment-vars', bundle.environmentVars],
      ['10-installer',        bundle.installerDiagnostics],
    ];

    await Promise.all([
      ...sections.map(([name, data]) =>
        writeFile(
          join(folderPath, `${name}.json`),
          JSON.stringify(data, null, 2),
          'utf8',
        ),
      ),
      writeFile(join(folderPath, 'README.txt'), README_CONTENT, 'utf8'),
    ]);

    return folderPath;
  }

  // ---------------------------------------------------------------------------
  // NDJSON export (Claude Code-readable)
  // ---------------------------------------------------------------------------

  /**
   * Writes all sections as NDJSON (one JSON object per line) to outputPath.
   * Each line includes a `_section` field.  Claude Code can scan this file
   * linearly for automated root-cause analysis without loading the entire bundle.
   */
  async exportToNDJSON(bundle: SupportBundle, outputPath: string): Promise<void> {
    const sections: Array<{ _section: string; [key: string]: unknown }> = [
      { _section: 'meta',        bundleId: bundle.bundleId, generatedAt: bundle.generatedAt },
      { _section: 'system',      ...bundle.system },
      { _section: 'model',       ...bundle.model },
      { _section: 'migrations',  ...bundle.migrations },
      { _section: 'health',      overall: bundle.health.overall, checks: bundle.health.checks },
      { _section: 'agent',       ...bundle.agent },
      { _section: 'pipeline',    ...bundle.pipeline },
      { _section: 'installer',   ...bundle.installerDiagnostics },
      { _section: 'env_vars',    vars: bundle.environmentVars },
      { _section: 'warnings',    lines: bundle.recentWarnings },
      // Crashes each get their own NDJSON line for easy grepping
      ...bundle.recentCrashes.map((c) => ({ _section: 'crash', ...c })),
    ];

    const ndjson = sections.map((s) => JSON.stringify(s)).join('\n') + '\n';
    await writeFile(outputPath, ndjson, 'utf8');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts an ISO8601 timestamp to a compact YYYYMMDD-HHMM string
   * suitable for use in file/folder names.
   */
  private _dateStamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const year  = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    const day   = pad(d.getUTCDate());
    const hour  = pad(d.getUTCHours());
    const min   = pad(d.getUTCMinutes());
    return `${year}${month}${day}-${hour}${min}`;
  }
}
