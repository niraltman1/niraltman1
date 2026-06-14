/**
 * modules/diagnostics — Business logic extracted from routes/diagnostics.ts.
 *
 * Covers:
 *   - probeOllama: reachability and model presence check
 *   - getMigrationVersion: safe DB migration version reader
 *   - readLogTail: read last N lines of the API log
 *   - safeEnvSnapshot: allowlisted subset of process.env for support bundles
 */

import { readFile } from 'node:fs/promises';
import type { DatabaseConnection } from '@factum-il/database';

// ── Ollama probe ──────────────────────────────────────────────────────────────

export interface OllamaProbeResult {
  reachable: boolean;
  modelPresent: boolean;
  detail: string;
}

/**
 * Probe the local Ollama instance: verify reachability and whether the
 * required model is registered.  Resolves within 3 s; never throws.
 */
export async function probeOllama(): Promise<OllamaProbeResult> {
  const url   = process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434';
  const model = process.env['OLLAMA_MODEL']    ?? 'BrainboxAI/law-il-E2B:Q4_K_M';
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 3_000);
    let body = '';
    try {
      const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
      if (!res.ok) return { reachable: false, modelPresent: false, detail: `http ${res.status}` };
      body = await res.text();
    } finally {
      clearTimeout(timeout);
    }
    const modelPresent = body.toLowerCase().includes(model.toLowerCase());
    return {
      reachable:    true,
      modelPresent,
      detail:       modelPresent ? 'model registered' : 'model missing',
    };
  } catch (e) {
    return {
      reachable:    false,
      modelPresent: false,
      detail:       e instanceof Error ? e.message : String(e),
    };
  }
}

// ── DB migration version ──────────────────────────────────────────────────────

/**
 * Return the highest applied migration version, or 0 when the table does
 * not yet exist or the query fails.
 */
export function getMigrationVersion(db: DatabaseConnection): number {
  try {
    const row = db
      .prepare('SELECT MAX(version) AS v FROM _migrations')
      .get() as { v: number | null } | undefined;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

// ── Log tail reader ───────────────────────────────────────────────────────────

/**
 * Read the last `maxLines` non-empty lines from `logPath`.
 * Returns an empty array on any I/O error so callers never need to handle it.
 */
export async function readLogTail(logPath: string, maxLines: number): Promise<string[]> {
  try {
    const content = await readFile(logPath, 'utf8');
    const lines   = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

// ── Safe env snapshot ─────────────────────────────────────────────────────────

/** Keys from process.env that are safe to include in a support bundle. */
const ENV_ALLOW_LIST = [
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
] as const;

/**
 * Return a safe subset of environment variables for inclusion in support
 * bundles.  Secrets (tokens, passwords, keys) are never included.
 */
export function safeEnvSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const key of ENV_ALLOW_LIST) {
    const val = process.env[key];
    if (val !== undefined) snapshot[key] = val;
  }
  return snapshot;
}
