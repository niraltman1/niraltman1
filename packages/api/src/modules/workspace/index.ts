/**
 * modules/workspace — Business logic extracted from routes/mission-control.ts.
 *
 * Covers:
 *   - collectQueues: aggregate queue state counts and poisoned-item count
 *   - collectWorkers: fetch live worker health rows
 *   - collectDatabase: compute DB size (MB) and WAL checkpoint frames
 *   - collectSchedulers: last-run timestamps for scheduler categories
 *   - collectRecentFailures: last 10 failure events from activity_events
 *   - collectAiStatus: HEAD-check Ollama and report latency
 *
 * All functions accept a DatabaseConnection so they can be unit-tested
 * without a full Repos object, and each fails safely (returns a neutral
 * value) on any DB/network error.
 */

import type { DatabaseConnection } from '@factum-il/database';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QueueSnapshot {
  total: number;
  poisoned: number;
  byState: Array<{ state: string; n: number }>;
}

export interface AiStatus {
  ollama: boolean;
  model: string;
  latencyMs: number;
}

export interface DatabaseSnapshot {
  sizeMb: number | null;
  walFrames: number;
}

// ── Collectors ───────────────────────────────────────────────────────────────

/**
 * Aggregate queue state counts and the number of poisoned items.
 */
export function collectQueues(db: DatabaseConnection): QueueSnapshot {
  try {
    const byState = db.prepare(`
      SELECT current_state AS state, COUNT(*) AS n FROM Queue GROUP BY current_state
    `).all() as Array<{ state: string; n: number }>;
    const poisoned = (db.prepare(
      `SELECT COUNT(*) AS n FROM Queue WHERE is_poisoned = 1`,
    ).get() as { n: number }).n;
    return { total: byState.reduce((acc, r) => acc + r.n, 0), poisoned, byState };
  } catch {
    return { total: 0, poisoned: 0, byState: [] };
  }
}

/**
 * Fetch live worker health rows ordered by worker_id.
 */
export function collectWorkers(db: DatabaseConnection): unknown[] {
  try {
    return db.prepare(`
      SELECT worker_id, status, last_heartbeat_at, current_task_count, memory_mb
      FROM WorkerHealth ORDER BY worker_id
    `).all();
  } catch {
    return [];
  }
}

/**
 * HEAD-check the local Ollama instance and return reachability + latency.
 * Resolves within 2 s; never throws.
 */
export async function collectAiStatus(): Promise<AiStatus> {
  const url   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  const model = process.env['OLLAMA_MODEL']    ?? 'BrainboxAI/law-il-E2B:Q4_K_M';
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 2_000);
    const res        = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    return { ollama: res.ok, model, latencyMs: Date.now() - start };
  } catch {
    return { ollama: false, model, latencyMs: Date.now() - start };
  }
}

/**
 * Return DB file size in MB and WAL checkpoint frame count.
 */
export function collectDatabase(db: DatabaseConnection): DatabaseSnapshot {
  try {
    const sizeRow = db.prepare(
      `SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()`,
    ).get() as { bytes: number } | undefined;
    const walRow  = db.prepare(
      `SELECT * FROM pragma_wal_checkpoint`,
    ).get() as Record<string, number> | undefined;
    return {
      sizeMb:    sizeRow ? Math.round(sizeRow.bytes / (1024 * 1024) * 10) / 10 : null,
      walFrames: walRow?.['busy'] ?? 0,
    };
  } catch {
    return { sizeMb: null, walFrames: 0 };
  }
}

/**
 * Return last-run timestamps and run counts for scheduler activity sources.
 */
export function collectSchedulers(db: DatabaseConnection): unknown[] {
  try {
    return db.prepare(`
      SELECT source, MAX(emitted_at) AS last_run, COUNT(*) AS run_count
      FROM activity_events
      WHERE source LIKE 'scheduler:%'
      GROUP BY source
    `).all();
  } catch {
    return [];
  }
}

/**
 * Return the 10 most recent failure events from activity_events.
 */
export function collectRecentFailures(db: DatabaseConnection): unknown[] {
  try {
    return db.prepare(`
      SELECT id, kind, case_id, document_id, message, emitted_at
      FROM activity_events
      WHERE kind LIKE '%failed%' OR kind = 'queue_failure'
      ORDER BY emitted_at DESC LIMIT 10
    `).all();
  } catch {
    return [];
  }
}
