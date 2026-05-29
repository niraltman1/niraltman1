#!/usr/bin/env tsx
/**
 * Inject UTF-8 BOMs into staged PowerShell scripts.
 *
 * Usage: tsx scripts/add-bom-to-dist.ts [staging-dir]
 *   staging-dir defaults to <repo-root>/FactumIL_Dist
 *
 * POLICY — opt-in allowlist (NOT exclusion):
 *   A BOM is added ONLY to file types on an explicit allowlist. Everything
 *   else is left byte-for-byte untouched. This is deliberate: a UTF-8 BOM is
 *   only beneficial for files that Windows tools open as text and decode by
 *   guessing the codepage (PowerShell 5.1 mis-reads Hebrew as Windows-1252
 *   without one). For every other staged file the BOM is at best pointless
 *   and at worst breaks a parser:
 *     - .json   → JSON.parse() throws on a leading BOM (e.g. Legal_Registry.json,
 *                 .NET runtimeconfig.json / deps.json read by the host at startup)
 *     - .sql    → tolerated by SQLite but changes the migration checksum; no benefit
 *     - .js/.ts → Node/TS loaders; no human ever opens these
 *     - .html/.css/manifests/config/runtime artifacts → consumed by parsers, never
 *                 hand-edited
 *   Keeping the allowlist tight gives deterministic behaviour and no hidden
 *   runtime regressions.
 *
 * Only touches files inside the staging directory — NEVER source files.
 * Idempotent: skips files that already begin with 0xEF 0xBB 0xBF.
 *
 * Exit code 0 → all files processed successfully
 * Exit code 1 → one or more files failed
 */

import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), '..');
const stagingDir  = process.argv[2] ?? join(ROOT, 'FactumIL_Dist');

// ── Terminal colours ──────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

const OK   = `${GREEN}✓${RESET}`;
const FAIL = `${RED}✗${RESET}`;
const WARN = `${YELLOW}⚠${RESET}`;

function pass(msg: string): void  { console.log(`${OK}  ${msg}`); }
function fail(msg: string, detail?: string): void {
  console.log(`${FAIL}  ${msg}${detail ? ` — ${RED}${detail}${RESET}` : ''}`);
}
function warn(msg: string): void  { console.log(`${WARN}  ${msg}`); }

// ── Allowlist — the ONLY file types that receive a BOM ────────────────────────
// PowerShell 5.1 reads .ps1/.psm1/.psd1 as Windows-1252 unless a UTF-8 BOM is
// present, which mangles the Hebrew string literals in our helper scripts.
// PowerShell itself handles the BOM correctly. No other staged file type is on
// this list — see the POLICY note in the file header for why.
const BOM_EXTENSIONS = new Set([
  '.ps1', '.psm1', '.psd1',   // PowerShell scripts / modules / data files
]);

const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

let injected   = 0;
let alreadyHad = 0;
let skipped    = 0;
let failures   = 0;

function hasBom(filePath: string): boolean {
  const size = statSync(filePath).size;
  if (size < 3) return false;
  const head = Buffer.alloc(3);
  const fd   = openSync(filePath, 'r');
  try {
    readSync(fd, head, 0, 3, 0);
    return head.equals(BOM);
  } finally {
    closeSync(fd);
  }
}

function injectBom(filePath: string): void {
  const ext = extname(filePath).toLowerCase();

  // Opt-in allowlist: anything not explicitly listed is left untouched.
  if (!BOM_EXTENSIONS.has(ext)) {
    skipped++;
    return;
  }

  const rel = relative(stagingDir, filePath);

  try {
    if (hasBom(filePath)) {
      warn(`already has BOM — ${rel}`);
      alreadyHad++;
      return;
    }

    const original = readFileSync(filePath);
    writeFileSync(filePath, Buffer.concat([BOM, original]));
    pass(`BOM injected — ${rel}`);
    injected++;
  } catch (err) {
    fail(`failed — ${rel}`, String(err));
    failures++;
  }
}

function walkDir(dir: string): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    fail(`unable to read directory — ${relative(stagingDir, dir)}`, String(err));
    failures++;
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full);
    } else if (entry.isFile()) {
      injectBom(full);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('');
console.log(`BOM injection target: ${stagingDir}`);
console.log('');

try {
  statSync(stagingDir);
} catch {
  console.log(`${RED}ERROR: staging directory not found: ${stagingDir}${RESET}`);
  process.exitCode = 1;
  process.exit();
}

walkDir(stagingDir);

console.log('');
console.log(`Injected: ${injected}  |  Already had BOM: ${alreadyHad}  |  Skipped: ${skipped}  |  Errors: ${failures}`);

if (failures > 0) {
  console.log(`${RED}BOM injection completed with ${failures} error(s).${RESET}`);
  process.exitCode = 1;
} else {
  console.log(`${GREEN}BOM injection complete.${RESET}`);
}
