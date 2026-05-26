/**
 * /api/diagnostics — System diagnostics and support bundle routes.
 *
 * GET  /api/diagnostics/status   — Extended system status (superset of /api/health)
 * POST /api/diagnostics/bundle   — Generate a support bundle JSON and return its path
 * GET  /api/diagnostics/crashes  — Return recent crash report summaries (last 20)
 * DELETE /api/diagnostics/crashes — Delete crash reports older than 72 hours
 */

import { Router } from 'express';
import { readdir, readFile, stat, unlink, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readFileSync, existsSync, createWriteStream } from 'node:fs';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const _dir = dirname(fileURLToPath(import.meta.url));

const versionInfo = JSON.parse(
  readFileSync(join(_dir, '..', 'generated', 'version.json'), 'utf8'),
) as { name: string; version: string; buildTimestamp: string; gitSha: string };

/** Age threshold for crash report pruning (72 hours in milliseconds). */
const CRASH_TTL_MS = 72 * 60 * 60 * 1_000;

/** Maximum crash summaries returned by GET /crashes. */
const MAX_CRASH_SUMMARIES = 20;

/** Maximum lines of the API log included in a support bundle. */
const LOG_TAIL_LINES = 200;

// ── Path helpers ──────────────────────────────────────────────────────────────

function getDataPath(): string {
  const localAppData =
    process.env['LOCALAPPDATA'] ??
    join(process.env['USERPROFILE'] ?? process.env['HOME'] ?? '.', 'AppData', 'Local');
  return process.env['FACTUM_IL_DATA_PATH'] ?? join(localAppData, 'FactumIL');
}

function getCrashDir(): string {
  return join(getDataPath(), 'diagnostics', 'crashes');
}

function getBundleDir(): string {
  return join(getDataPath(), 'support-bundles');
}

function getLogPath(): string {
  return join(getDataPath(), 'logs', 'app.log');
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function generateBundleId(): string {
  return `bundle-${isoTimestamp()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Friendly date stamp for the ZIP filename: YYYYMMDD-HHMM */
function zipDateStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

/** Zips a single JSON file into a ZIP archive. */
async function zipSingleFile(jsonPath: string, zipPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output  = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(jsonPath, { name: 'bundle.json' });
    void archive.finalize();
  });
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Returns the current migration version from the database, or 0 on error. */
function getMigrationVersion(repos: Repos): number {
  try {
    const row = repos.db
      .prepare('SELECT MAX(version) AS v FROM _migrations')
      .get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

/** Reads the last N lines of the API log file. Returns empty array on any error. */
async function readLogTail(logPath: string, maxLines: number): Promise<string[]> {
  try {
    const content = await readFile(logPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/** Safe subset of environment variables for support bundles — no secrets. */
function safeEnvSnapshot(): Record<string, string> {
  const allowList = [
    'NODE_ENV',
    'PORT',
    'FACTUM_IL_ROOT',
    'FACTUM_IL_DATA_PATH',
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'AI_TIER',
    'LOG_LEVEL',
    'COMPUTERNAME',
    'OS',
    'PROCESSOR_ARCHITECTURE',
  ];
  const snapshot: Record<string, string> = {};
  for (const key of allowList) {
    const val = process.env[key];
    if (val !== undefined) snapshot[key] = val;
  }
  return snapshot;
}

/** Probe Ollama and return basic reachability + model status. */
async function probeOllama(): Promise<{
  reachable: boolean;
  modelPresent: boolean;
  detail: string;
}> {
  const url = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  const model = process.env['OLLAMA_MODEL'] ?? 'BrainboxAI/law-il-E2B:Q4_K_M';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    let body = '';
    try {
      const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { reachable: false, modelPresent: false, detail: `http ${res.status}` };
      body = await res.text();
    } finally {
      clearTimeout(timeout);
    }
    const modelPresent = body.toLowerCase().includes(model.toLowerCase());
    return { reachable: true, modelPresent, detail: modelPresent ? 'model registered' : 'model missing' };
  } catch (e) {
    return { reachable: false, modelPresent: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function diagnosticsRouter(repos: Repos): Router {
  const router = Router();

  // ── GET /api/diagnostics/status ────────────────────────────────────────────
  //
  // Returns extended system status: everything in /api/health plus crash count,
  // bundle count, disk info on the data directory, and Ollama model presence.

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      const [ollama, logLines] = await Promise.all([
        probeOllama(),
        readLogTail(getLogPath(), 50),
      ]);

      // Count crash reports
      let crashCount = 0;
      try {
        const files = await readdir(getCrashDir()).catch(() => [] as string[]);
        crashCount = files.filter((f) => f.startsWith('crash-') && f.endsWith('.json')).length;
      } catch { /* ignore */ }

      // Count support bundles (ZIP + legacy JSON)
      let bundleCount = 0;
      try {
        const files = await readdir(getBundleDir()).catch(() => [] as string[]);
        bundleCount = files.filter((f) => f.endsWith('.zip') || f.endsWith('.json')).length;
      } catch { /* ignore */ }

      // Recent error lines from log
      const errorLines = logLines.filter((l) =>
        /Error|Exception|FAILED|SQLITE_|unhandledRejection|uncaughtException/i.test(l),
      );

      res.json({
        ok:         true,
        ts:         Date.now(),
        version:    versionInfo.version,
        buildTs:    versionInfo.buildTimestamp,
        gitSha:     versionInfo.gitSha,
        database: {
          migrationVersion: getMigrationVersion(repos),
        },
        ollama,
        diagnostics: {
          crashCount,
          bundleCount,
          recentErrors: errorLines.slice(-10),
        },
      });
    }),
  );

  // ── POST /api/diagnostics/bundle ───────────────────────────────────────────
  //
  // Collects environment info, DB migration version, recent log lines, and
  // crash summaries, then writes a JSON bundle to {dataPath}/support-bundles/.
  // Returns the bundle path and ID.

  router.post(
    '/bundle',
    asyncHandler(async (_req, res) => {
      const bundleId  = generateBundleId();
      const bundleDir = getBundleDir();
      await mkdir(bundleDir, { recursive: true });

      const bundlePath = join(bundleDir, `${bundleId}.json`);

      const [ollama, logLines] = await Promise.all([
        probeOllama(),
        readLogTail(getLogPath(), LOG_TAIL_LINES),
      ]);

      // Collect recent crash summaries for the bundle
      const crashFiles = await readdir(getCrashDir()).catch(() => [] as string[]);
      const recentCrashes: unknown[] = [];
      for (const file of crashFiles
        .filter((f) => f.startsWith('crash-') && f.endsWith('.json'))
        .sort()
        .slice(-10)) {
        try {
          const raw = await readFile(join(getCrashDir(), file), 'utf8');
          recentCrashes.push(JSON.parse(raw) as unknown);
        } catch { /* skip malformed */ }
      }

      const bundle = {
        bundleId,
        generatedAt:     new Date().toISOString(),
        schema:          'factum-il-diag-bundle/v1',
        app: {
          name:    versionInfo.name,
          version: versionInfo.version,
          buildTs: versionInfo.buildTimestamp,
          gitSha:  versionInfo.gitSha,
        },
        database: {
          migrationVersion: getMigrationVersion(repos),
        },
        ollama,
        env:         safeEnvSnapshot(),
        logTail:     logLines,
        recentCrashes,
      };

      await writeFile(bundlePath, JSON.stringify(bundle, null, 2), 'utf8');

      // Compress into a user-friendly ZIP: factum-support-YYYYMMDD-HHMM.zip
      const filename = `factum-support-${zipDateStamp()}.zip`;
      const zipPath  = join(bundleDir, filename);
      try {
        await zipSingleFile(bundlePath, zipPath);
      } finally {
        // Always remove the raw JSON regardless of ZIP outcome.
        await rm(bundlePath, { force: true });
      }

      res.status(201).json({
        bundleId,
        bundlePath:  zipPath,
        filename,
        generatedAt: bundle.generatedAt,
      });
    }),
  );

  // ── GET /api/diagnostics/crashes ───────────────────────────────────────────
  //
  // Returns the last MAX_CRASH_SUMMARIES crash reports as parsed JSON objects.

  router.get(
    '/crashes',
    asyncHandler(async (_req, res) => {
      const crashDir = getCrashDir();

      let files: string[] = [];
      try {
        files = await readdir(crashDir);
      } catch {
        res.json({ crashes: [], total: 0 });
        return;
      }

      const crashFiles = files
        .filter((f) => f.startsWith('crash-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, MAX_CRASH_SUMMARIES);

      const crashes: unknown[] = [];
      for (const file of crashFiles) {
        try {
          const raw = await readFile(join(crashDir, file), 'utf8');
          crashes.push(JSON.parse(raw) as unknown);
        } catch { /* skip unreadable */ }
      }

      res.json({ crashes, total: crashes.length });
    }),
  );

  // ── DELETE /api/diagnostics/crashes ───────────────────────────────────────
  //
  // Deletes crash report files older than 72 hours.
  // Returns counts of deleted and retained files.

  router.delete(
    '/crashes',
    asyncHandler(async (_req, res) => {
      const crashDir  = getCrashDir();
      const now       = Date.now();
      let deleted     = 0;
      let retained    = 0;

      let files: string[] = [];
      try {
        files = await readdir(crashDir);
      } catch {
        res.json({ deleted: 0, retained: 0 });
        return;
      }

      for (const file of files.filter((f) => f.startsWith('crash-') && f.endsWith('.json'))) {
        const filePath = join(crashDir, file);
        try {
          const info = await stat(filePath);
          const ageMs = now - info.mtimeMs;
          if (ageMs > CRASH_TTL_MS) {
            await unlink(filePath);
            deleted++;
          } else {
            retained++;
          }
        } catch { /* skip unreadable or already deleted */ }
      }

      res.json({ deleted, retained, pruneOlderThanHours: 72 });
    }),
  );

  return router;
}
