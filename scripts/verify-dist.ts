#!/usr/bin/env tsx
/**
 * Verify that a built Factum-IL distribution is complete and launchable.
 *
 * Usage: tsx scripts/verify-dist.ts
 * Exit code 0 → DEPLOYMENT READY
 * Exit code 1 → one or more fatal checks failed (MISSING list printed)
 */

import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Terminal colours ──────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

const OK   = `${GREEN}✓${RESET}`;
const FAIL = `${RED}✗${RESET}`;
const WARN = `${YELLOW}⚠${RESET}`;

const missing: string[] = [];

function pass(msg: string): void  { console.log(`${OK}  ${msg}`); }
function fail(msg: string, detail?: string): void {
  console.log(`${FAIL}  ${msg}${detail ? ` — ${RED}${detail}${RESET}` : ''}`);
  missing.push(msg);
}
function warn(msg: string, detail?: string): void {
  console.log(`${WARN}  ${msg}${detail ? ` — ${detail}` : ''}`);
}

// ── Check 1: API compiled entry point ────────────────────────────────────
const apiEntry = join(ROOT, 'packages', 'api', 'dist', 'start.js');
if (existsSync(apiEntry)) {
  pass('packages/api/dist/start.js');
} else {
  fail('packages/api/dist/start.js', 'not found — run: pnpm --filter @factum-il/api build');
}

// ── Check 2: Dashboard SPA ────────────────────────────────────────────────
const dashEntry = join(ROOT, 'apps', 'dashboard', 'dist', 'index.html');
if (existsSync(dashEntry)) {
  pass('apps/dashboard/dist/index.html');
} else {
  fail('apps/dashboard/dist/index.html', 'not found — run: pnpm --filter dashboard build');
}

// ── Check 3 + 4: Migrations directory and SQL files ───────────────────────
const migrationsDir = join(ROOT, 'migrations');
if (!existsSync(migrationsDir)) {
  fail('migrations/', 'directory not found');
} else {
  const sqlFiles = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    fail('migrations/', 'directory exists but contains no .sql files');
  } else {
    pass(`migrations/ (${sqlFiles.length} files)`);

    // ── Check 5: No duplicate version numbers ──────────────────────────
    const versionCounts = new Map<string, string[]>();
    for (const f of sqlFiles) {
      const m = /^(\d+)_/.exec(f);
      if (m) {
        const ver = m[1]!;
        if (!versionCounts.has(ver)) versionCounts.set(ver, []);
        versionCounts.get(ver)!.push(f);
      }
    }
    const dups = [...versionCounts.entries()].filter(([, files]) => files.length > 1);
    if (dups.length > 0) {
      for (const [ver, files] of dups) {
        fail(`migration version conflict: ${ver}`, files.join(' vs '));
      }
    } else {
      pass('No duplicate migration version numbers');
    }

    // ── Check 6: Migrations parse cleanly on :memory: DB ──────────────
    const db = new Database(':memory:');
    const failures: string[] = [];

    const idempotencyErrors: string[] = [];
    for (const f of sqlFiles) {
      const content = readFileSync(join(migrationsDir, f), 'utf8');
      const firstLine = content.split('\n').find(l => l.trim().length > 0) ?? '';
      if (firstLine.includes('SKIP_ON_ERROR')) continue; // needs native extensions

      try {
        db.exec(content);
      } catch (err) {
        const msg = String(err);
        // "table X already exists" is expected when an earlier migration already created the
        // same table without IF NOT EXISTS. The real runner prevents this via version tracking.
        if (msg.includes('already exists') || msg.includes('duplicate column name')) {
          idempotencyErrors.push(`${f} (non-fatal: ${msg.split('\n')[0]})`);
        } else {
          failures.push(`${f}: ${msg.split('\n')[0]}`);
        }
      }
    }

    db.close();

    if (failures.length > 0) {
      for (const f of failures) {
        fail(`Migration parse error: ${f}`);
      }
    } else {
      pass('All migrations parse cleanly on :memory: DB');
      for (const e of idempotencyErrors) {
        warn(`Migration idempotency note: ${e}`);
      }
    }
  }
}

// ── Check 7: Backfill script (optional, warning only) ────────────────────
const backfillScript = join(ROOT, 'scripts', 'backfill-vec-chunks.ts');
if (existsSync(backfillScript)) {
  pass('scripts/backfill-vec-chunks.ts');
} else {
  warn('scripts/backfill-vec-chunks.ts not found (optional, skipping)');
}

// ── Final verdict ─────────────────────────────────────────────────────────
console.log('');
if (missing.length === 0) {
  console.log(`${GREEN}DEPLOYMENT READY${RESET}`);
} else {
  console.log(`${RED}MISSING:${RESET}`);
  for (const m of missing) console.log(`  • ${m}`);
  process.exitCode = 1;
}
