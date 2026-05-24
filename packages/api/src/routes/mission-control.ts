import { Router } from 'express';
import type { Repos } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { writeLockStatus } from '../utils/write-mutex.js';

export function missionControlRouter(repos: Repos): Router {
  const router = Router();

  router.get('/snapshot', asyncHandler(async (_req, res) => {
    const snapshot = {
      queues:          collectQueues(repos),
      workers:         collectWorkers(repos),
      ai:              await collectAi(),
      database:        collectDatabase(repos),
      writeMutex:      writeLockStatus(),
      schedulers:      collectSchedulers(repos),
      recentFailures:  collectRecentFailures(repos),
      ts: new Date().toISOString(),
    };
    ok(res, snapshot);
  }));

  return router;
}

function collectQueues(repos: Repos): unknown {
  try {
    const byState = repos.db.prepare(`
      SELECT current_state AS state, COUNT(*) AS n FROM Queue GROUP BY current_state
    `).all() as Array<{ state: string; n: number }>;
    const poisoned = (repos.db.prepare(`SELECT COUNT(*) AS n FROM Queue WHERE is_poisoned = 1`).get() as { n: number }).n;
    const total    = byState.reduce((acc, r) => acc + r.n, 0);
    return { total, poisoned, byState };
  } catch {
    return { total: 0, poisoned: 0, byState: [] };
  }
}

function collectWorkers(repos: Repos): unknown {
  try {
    return repos.db.prepare(`
      SELECT worker_id, status, last_heartbeat_at, current_task_count, memory_mb
      FROM WorkerHealth ORDER BY worker_id
    `).all();
  } catch {
    return [];
  }
}

async function collectAi(): Promise<unknown> {
  const url   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  const model = process.env['OLLAMA_MODEL']    ?? 'law-il-E2B';
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return { ollama: res.ok, model, latencyMs: Date.now() - start };
  } catch {
    return { ollama: false, model, latencyMs: Date.now() - start };
  }
}

function collectDatabase(repos: Repos): unknown {
  try {
    const sizeRow = repos.db.prepare(`SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()`).get() as { bytes: number } | undefined;
    const walRow  = repos.db.prepare(`SELECT * FROM pragma_wal_checkpoint`).get() as Record<string, number> | undefined;
    return {
      sizeMb: sizeRow ? Math.round(sizeRow.bytes / (1024 * 1024) * 10) / 10 : null,
      walFrames: walRow?.['busy'] ?? 0,
    };
  } catch {
    return { sizeMb: null, walFrames: 0 };
  }
}

function collectSchedulers(repos: Repos): unknown {
  // Look at activity_events for last-run timestamps of scheduler categories
  try {
    return repos.db.prepare(`
      SELECT source, MAX(emitted_at) AS last_run, COUNT(*) AS run_count
      FROM activity_events
      WHERE source LIKE 'scheduler:%'
      GROUP BY source
    `).all();
  } catch {
    return [];
  }
}

function collectRecentFailures(repos: Repos): unknown {
  try {
    return repos.db.prepare(`
      SELECT id, kind, case_id, document_id, message, emitted_at
      FROM activity_events
      WHERE kind LIKE '%failed%' OR kind = 'queue_failure'
      ORDER BY emitted_at DESC LIMIT 10
    `).all();
  } catch {
    return [];
  }
}
