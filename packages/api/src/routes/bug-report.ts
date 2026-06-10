import { Router } from 'express';
import { z } from 'zod';
import { join, dirname } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middleware/validate.js';

const _dir = dirname(fileURLToPath(import.meta.url));
const versionInfo = JSON.parse(
  readFileSync(join(_dir, '..', 'generated', 'version.json'), 'utf8'),
) as { name: string; version: string; buildTimestamp: string; gitSha: string };

const LOG_TAIL_LINES = 200;
const ERROR_PATTERN  = /Error|Exception|FAILED|Mutex|SQLITE_|unhandledRejection|uncaughtException/;

function getDesktopPath(): string {
  const userProfile = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.';
  return join(userProfile, 'Desktop');
}

function getLogPath(): string {
  const localAppData = process.env['LOCALAPPDATA']
    ?? join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.', 'AppData', 'Local');
  return join(localAppData, 'FactumIL', 'logs', 'app.log');
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function readLogTail(logPath: string): Promise<string[]> {
  try {
    const content = await readFile(logPath, 'utf8');
    const lines   = content.split('\n').filter(Boolean);
    return lines.slice(-LOG_TAIL_LINES);
  } catch {
    return ['(log file not found or not yet created in this environment)'];
  }
}

function buildSanitizedErrorStack(lines: string[]): string {
  const highlighted = lines.map((line) =>
    ERROR_PATTERN.test(line) ? `**${line}**` : line,
  ).join('\n');

  const version = versionInfo.version;
  const buildTs = versionInfo.buildTimestamp;

  return `---
app_version: "${version}"
build_timestamp: "${buildTs}"
log_lines: ${lines.length}
---\n\n${highlighted}`;
}

function getPipelineStatus(repos: Repos): Record<string, { status: string; detail?: string }> {
  try {
    const workers = repos.db
      .prepare('SELECT worker_type, status FROM WorkerHealth ORDER BY last_heartbeat DESC')
      .all() as Array<{ worker_type: string; status: string }>;

    const byType: Record<string, string> = {};
    for (const w of workers) {
      if (!byType[w.worker_type]) byType[w.worker_type] = w.status;
    }

    return {
      ocr:     { status: byType['ocr']     ?? 'unknown' },
      whisper: { status: byType['whisper'] ?? 'unknown' },
      rag:     { status: byType['rag']     ?? 'unknown' },
    };
  } catch {
    return {
      ocr:     { status: 'unknown' },
      whisper: { status: 'unknown' },
      rag:     { status: 'unknown' },
    };
  }
}

function getDbMigrationVersion(repos: Repos): number {
  try {
    const row = repos.db
      .prepare('SELECT MAX(version) AS v FROM _migrations')
      .get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

const bugReportSchema = z.object({
  activeRoute:      z.string().optional(),
  userDescription:  z.string().optional(),
}).strict();

export function bugReportRouter(repos: Repos): Router {
  const router = Router();

  router.post('/', validate(bugReportSchema), asyncHandler(async (req, res) => {
    const { activeRoute, userDescription } = req.body as z.infer<typeof bugReportSchema>;

    const ts         = isoTimestamp();
    const zipName    = `FactumIL_Beta_Bug_${ts}.zip`;
    const desktopDir = getDesktopPath();
    const zipPath    = join(desktopDir, zipName);

    await mkdir(desktopDir, { recursive: true });

    const vi = versionInfo;

    // 1 — claude_manifest.json
    const manifest = {
      schema:              'factum-il-bug-report/v1',
      app:                 vi.name,
      version:             vi.version,
      buildTimestamp:      vi.buildTimestamp,
      gitSha:              vi.gitSha,
      reportTimestamp:     new Date().toISOString(),
      activeRoute:         activeRoute ?? '(unknown)',
      dbMigrationVersion:  getDbMigrationVersion(repos),
      pipelines:           getPipelineStatus(repos),
    };

    // 2 — sanitized_error_stack.md
    const logLines   = await readLogTail(getLogPath());
    const errorStack = buildSanitizedErrorStack(logLines);

    // 3 — user_context_bug_report.txt
    const contextTxt = [
      `SCREEN: ${activeRoute ?? '(unknown)'}`,
      `TIMESTAMP: ${new Date().toISOString()}`,
      '',
      userDescription?.trim() ?? '(no description provided)',
    ].join('\n');

    // Build ZIP
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const zip    = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      zip.on('error', reject);
      zip.pipe(output);

      zip.append(JSON.stringify(manifest, null, 2), { name: 'claude_manifest.json' });
      zip.append(errorStack,                          { name: 'sanitized_error_stack.md' });
      zip.append(contextTxt,                          { name: 'user_context_bug_report.txt' });

      void zip.finalize();
    });

    res.json({ success: true, data: { desktopPath: zipPath, zipName } });
  }));

  return router;
}
