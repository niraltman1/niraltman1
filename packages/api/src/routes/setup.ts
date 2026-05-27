import { Router } from 'express';
import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { validate } from '../middleware/validate.js';

const MIN_FREE_DISK_MB = 100;
const LATEST_MIGRATION_VERSION = 37;

interface StatusCheck {
  healthy: boolean;
  detail?: string;
}

interface SetupStatus {
  completed:    boolean;
  db:           StatusCheck;
  migrations:   StatusCheck;
  ollama:       StatusCheck;
  disk:         StatusCheck;
  orgDirectory: string;
}

function checkDb(repos: Repos): StatusCheck {
  try {
    const row = repos.db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return { healthy: row?.ok === 1 };
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkMigrations(repos: Repos): StatusCheck {
  try {
    const row = repos.db.prepare('SELECT MAX(version) AS v FROM _migrations').get() as { v: number | null } | undefined;
    const current = row?.v ?? 0;
    return {
      healthy: current >= LATEST_MIGRATION_VERSION,
      detail:  `current=${current} expected>=${LATEST_MIGRATION_VERSION}`,
    };
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function checkOllama(): Promise<StatusCheck> {
  const url = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      return { healthy: res.status < 500, detail: `http ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : 'connection refused' };
  }
}

async function checkDisk(dbPath: string): Promise<StatusCheck> {
  try {
    const stats  = await statfs(dirname(dbPath));
    const freeMb = (stats.bavail * stats.bsize) / (1024 * 1024);
    return {
      healthy: freeMb >= MIN_FREE_DISK_MB,
      detail:  `free=${Math.round(freeMb)}MB min=${MIN_FREE_DISK_MB}MB`,
    };
  } catch (e) {
    return { healthy: false, detail: e instanceof Error ? e.message : 'unknown' };
  }
}

const setOrgDirSchema = z.object({
  orgDirectory: z.string().min(1).max(500),
}).strict();

export function setupRouter(repos: Repos, dbPath: string): Router {
  const router = Router();

  // GET /api/setup/status — condensed system health for the onboarding wizard
  router.get('/status', asyncHandler(async (_req, res) => {
    const [db, migrations, ollama, disk] = await Promise.all([
      Promise.resolve(checkDb(repos)),
      Promise.resolve(checkMigrations(repos)),
      checkOllama(),
      checkDisk(dbPath),
    ]);

    const status: SetupStatus = {
      completed:    repos.config.isSetupCompleted(),
      db,
      migrations,
      ollama,
      disk,
      orgDirectory: repos.config.orgDirectory,
    };

    ok(res, status);
  }));

  // POST /api/setup/complete — marks first-run setup as done
  router.post('/complete', asyncHandler(async (_req, res) => {
    repos.config.markSetupCompleted();
    ok(res, { ok: true });
  }));

  // POST /api/setup/org-dir — updates the org directory
  router.post('/org-dir', validate(setOrgDirSchema), asyncHandler(async (req, res) => {
    const { orgDirectory } = req.body as z.infer<typeof setOrgDirSchema>;
    repos.config.setOrgDirectory(orgDirectory);
    ok(res, { ok: true, orgDirectory });
  }));

  return router;
}
