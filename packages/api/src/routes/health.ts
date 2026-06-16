import { Router } from 'express';
import { statfs } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { RagHealingService } from '../utils/rag-healing.js';

const _dir = dirname(fileURLToPath(import.meta.url));
const versionInfo = JSON.parse(
  readFileSync(join(_dir, '..', 'generated', 'version.json'), 'utf8'),
) as { name: string; version: string; buildTimestamp: string; gitSha: string };

interface CheckResult {
  healthy:    boolean;
  detail?:    string;
  durationMs: number;
}

const LATEST_MIGRATION_VERSION = 85;
const MIN_FREE_DISK_MB = 100;

// Ollama cache — avoids blocking requests during model loading
const ollamaCache: { ready: boolean; ts: number } = { ready: false, ts: 0 };
const OLLAMA_CACHE_TTL_MS = 30_000;

async function timed<T>(fn: () => Promise<T> | T): Promise<{ result: T | null; durationMs: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, durationMs: Date.now() - start };
  } catch (e) {
    return { result: null, durationMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

function checkDb(repos: Repos): CheckResult {
  const start = Date.now();
  try {
    const row = repos.db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return { healthy: row?.ok === 1, durationMs: Date.now() - start };
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

function checkMigrations(repos: Repos): CheckResult {
  const start = Date.now();
  try {
    const row = repos.db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number | null } | undefined;
    const current = row?.v ?? 0;
    return {
      healthy: current >= LATEST_MIGRATION_VERSION,
      detail:  `current=${current} expected>=${LATEST_MIGRATION_VERSION}`,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

async function checkOllama(): Promise<CheckResult> {
  const url = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  const t = await timed(async () => {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2_000);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      return res.status;
    } finally {
      clearTimeout(timeout);
    }
  });
  const healthy = !t.error && (t.result ?? 0) < 500;
  ollamaCache.ready = healthy;
  ollamaCache.ts    = Date.now();
  if (t.error) return { healthy: false, detail: t.error, durationMs: t.durationMs };
  return { healthy, detail: `http ${t.result}`, durationMs: t.durationMs };
}

function getAiReady(): boolean {
  if (Date.now() - ollamaCache.ts < OLLAMA_CACHE_TTL_MS) return ollamaCache.ready;
  // Trigger refresh in background; return last known state
  void checkOllama();
  return ollamaCache.ready;
}

function checkQueue(repos: Repos): CheckResult {
  const start = Date.now();
  try {
    const stale = repos.db.prepare(`
      SELECT COUNT(*) AS n FROM Queue
      WHERE lock_expires_at IS NOT NULL
        AND lock_expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).get() as { n: number };
    return {
      healthy: stale.n < 100,
      detail:  `stale_locks=${stale.n}`,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    // Queue table may not exist in older test envs
    return { healthy: true, detail: e instanceof Error ? e.message : String(e), durationMs: Date.now() - start };
  }
}

async function checkDisk(dbPath: string): Promise<CheckResult> {
  const t = await timed(async () => {
    const dir   = dirname(dbPath);
    const stats = await statfs(dir);
    const freeMb = (stats.bavail * stats.bsize) / (1024 * 1024);
    return freeMb;
  });
  if (t.error || t.result == null) {
    return { healthy: false, detail: t.error ?? 'unknown', durationMs: t.durationMs };
  }
  return {
    healthy: t.result >= MIN_FREE_DISK_MB,
    detail:  `free=${Math.round(t.result)}MB min=${MIN_FREE_DISK_MB}MB`,
    durationMs: t.durationMs,
  };
}

export function healthRouter(repos: Repos, dbPath: string, healingService: RagHealingService): Router {
  const router = Router();

  router.get('/', asyncHandler(async (_req, res) => {
    const [db, migrations, ollama, queue, disk] = await Promise.all([
      Promise.resolve(checkDb(repos)),
      Promise.resolve(checkMigrations(repos)),
      checkOllama(),
      Promise.resolve(checkQueue(repos)),
      checkDisk(dbPath),
    ]);

    const fts5Healthy = healingService.probeFts5();
    const rag = {
      fts5:        { healthy: fts5Healthy, ...(fts5Healthy ? {} : { detail: 'FTS5 index unavailable — run POST /api/admin/repair/rag' }) },
      ollamaLastOkAt: healingService.getLastOllamaOkAt(),
    };

    const checks = { db, migrations, ollama, queue, disk, rag };
    const isOk = db.healthy && migrations.healthy && queue.healthy && disk.healthy;
    // Ollama and FTS5 down are degraded, not fatal — server still serves cached data
    res.status(isOk ? 200 : 503).json({
      ok: isOk, ts: Date.now(), checks,
      ai_ready: getAiReady(),
      version: versionInfo.version,
    });
  }));

  // Lightweight ping for load balancers
  router.get('/ping', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  return router;
}
