#!/usr/bin/env tsx
/**
 * Inject UTF-8 BOMs into staged distribution text files.
 *
 * Usage: tsx scripts/add-bom-to-dist.ts [staging-dir]
 *   staging-dir defaults to <repo-root>/FactumIL_Dist
 *
 * Only injects BOMs into files in the staging directory — NEVER source files.
 * Idempotent: skips files that already begin with 0xEF 0xBB 0xBF.
 * Skips .js/.mjs/.cjs to avoid breaking Node.js ESM module loading.
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
import { extname, join, relative } from 'node:path';
import { dirname } from 'node:path';
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

// ── Extensions that need BOM for correct Windows encoding detection ───────────
// Windows tools (Notepad, PowerShell 5.1, Inno Setup) default to Windows-1252
// without a BOM marker; Hebrew characters become mojibake without it.
const BOM_EXTENSIONS = new Set([
  '.ps1', '.psm1', '.psd1',   // PowerShell
  '.sql',                      // SQL migrations (may contain Hebrew comments)
  '.json',                     // Config files (Legal_Registry.json etc.)
  '.txt', '.md',               // Documentation
  '.iss',                      // Inno Setup scripts (contain Hebrew strings)
  '.csv',                      // Data exports
  '.log',                      // Log files
]);

// Extensions that MUST NOT receive a BOM — would break their runtime/parser.
const BOM_EXCLUDED = new Set([
  '.js', '.mjs', '.cjs',      // Node.js ESM/CJS loader rejects BOM
  '.ts', '.tsx', '.mts',      // TypeScript compiler chokes on BOM
  '.jsx',
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
  readSync(fd, head, 0, 3, 0);
  closeSync(fd);
  return head.equals(BOM);
}

function injectBom(filePath: string): void {
  const ext = extname(filePath).toLowerCase();

  if (BOM_EXCLUDED.has(ext)) {
    skipped++;
    return;
  }

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
  const entries = readdirSync(dir, { withFileTypes: true });
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
