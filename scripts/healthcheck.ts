#!/usr/bin/env tsx
/**
 * Factum-IL system healthcheck.
 * Run: tsx scripts/healthcheck.ts
 * Returns JSON diagnostics and exits 0 (all critical checks pass) or 1.
 */

import { existsSync, accessSync, constants, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

interface Check {
  name:    string;
  ok:      boolean;
  detail:  string;
  fatal:   boolean;
}

const checks: Check[] = [];
const ROOT = process.cwd();

function pass(name: string, detail: string, fatal = true): void {
  checks.push({ name, ok: true, detail, fatal });
}

function fail(name: string, detail: string, fatal = true): void {
  checks.push({ name, ok: false, detail, fatal });
}

// ─── 1. SQLite connectivity ───────────────────────────────────────────────────
try {
  const { default: Database } = await import('better-sqlite3') as { default: typeof import('better-sqlite3') };
  const db = new (Database as unknown as new (path: string) => { prepare(sql: string): { get(): unknown }; close(): void })(':memory:');
  const row = db.prepare('SELECT 1 AS ok').get() as { ok: number };
  db.close();
  if (row.ok === 1) {
    pass('sqlite', 'better-sqlite3 opens :memory: and executes SELECT 1');
  } else {
    fail('sqlite', 'SELECT 1 returned unexpected value');
  }
} catch (err) {
  fail('sqlite', `Cannot open SQLite: ${String(err)}`);
}

// ─── 2. data_store path writable ─────────────────────────────────────────────
const dbDir = join(ROOT, 'database');
try {
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  accessSync(dbDir, constants.W_OK);
  pass('data_store_path', `database/ directory is writable at ${dbDir}`);
} catch (err) {
  fail('data_store_path', `database/ not writable: ${String(err)}`);
}

// ─── 3. Writable filesystem (logs, uploads, temp) ────────────────────────────
for (const dir of ['logs', 'uploads', 'temp']) {
  const p = join(ROOT, dir);
  try {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    accessSync(p, constants.W_OK);
    pass(`filesystem_${dir}`, `${dir}/ is writable`);
  } catch (err) {
    fail(`filesystem_${dir}`, `${dir}/ not writable: ${String(err)}`);
  }
}

// ─── 4. sqlite-vec extension (non-fatal) ─────────────────────────────────────
try {
  const { default: Database } = await import('better-sqlite3') as { default: typeof import('better-sqlite3') };
  const db = new (Database as unknown as new (path: string) => { loadExtension(p: string): void; close(): void })(':memory:');
  // sqlite-vec ships a loadable extension; attempt via Node binding
  const sqliteVec = await import('sqlite-vec').catch(() => null) as { load(db: unknown): void } | null;
  if (sqliteVec) {
    sqliteVec.load(db);
    pass('vec_extension', 'sqlite-vec extension loaded successfully', false);
  } else {
    fail('vec_extension', 'sqlite-vec npm package not found — JS cosine fallback active', false);
  }
  db.close();
} catch (err) {
  fail('vec_extension', `sqlite-vec load failed: ${String(err)} — JS cosine fallback active`, false);
}

// ─── 5. Port availability ─────────────────────────────────────────────────────
const port = Number(process.env['PORT'] ?? 3000);
await new Promise<void>((resolve) => {
  const server = createServer();
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      fail('port', `Port ${port} is already in use — another process may be running`);
    } else {
      fail('port', `Port check failed: ${String(err)}`);
    }
    resolve();
  });
  server.once('listening', () => {
    server.close(() => {
      pass('port', `Port ${port} is available`);
      resolve();
    });
  });
  server.listen(port, '127.0.0.1');
});

// ─── 6. Ollama connectivity (non-fatal) ───────────────────────────────────────
const OLLAMA_URL = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
try {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(2000),
  });
  if (res.ok) {
    pass('ollama', `Ollama reachable at ${OLLAMA_URL}`, false);
  } else {
    fail('ollama', `Ollama responded ${res.status} — check if law-il-E2B model is loaded`, false);
  }
} catch {
  fail('ollama', `Ollama not reachable at ${OLLAMA_URL} — AI features will be disabled`, false);
}

// ─── Output ───────────────────────────────────────────────────────────────────
const fatalFailed = checks.filter((c) => !c.ok && c.fatal);
const allOk       = fatalFailed.length === 0;

const output = {
  ok:        allOk,
  timestamp: new Date().toISOString(),
  checks,
  summary:   allOk
    ? 'All critical checks passed — Factum-IL is ready to start'
    : `${fatalFailed.length} critical check(s) failed — fix before starting`,
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(allOk ? 0 : 1);
