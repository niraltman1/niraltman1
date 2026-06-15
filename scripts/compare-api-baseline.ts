#!/usr/bin/env tsx
/**
 * compare-api-baseline.ts  (Phase 6 companion to PRE-2)
 *
 * Reads API_BEHAVIOR_BASELINE.md (captured before Phase 6) and the current
 * route files, then diffs them to detect breaking API changes.
 *
 * Exit code 1 (fails CI) on any of:
 *   - Endpoint removed
 *   - HTTP method changed
 *   - RBAC role changed (widened or narrowed)
 *
 * Exit code 0 for purely additive changes (new endpoints, new optional fields).
 *
 * Writes API_BEHAVIOR_DIFF.md at the repo root.
 *
 * Usage:  pnpm tsx scripts/compare-api-baseline.ts
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const BASELINE   = join(REPO_ROOT, 'API_BEHAVIOR_BASELINE.md');
const ROUTES_DIR = join(REPO_ROOT, 'packages/api/src/routes');
const APP_TS     = join(REPO_ROOT, 'packages/api/src/app.ts');
const OUT_FILE   = join(REPO_ROOT, 'API_BEHAVIOR_DIFF.md');

if (!existsSync(BASELINE)) {
  console.error('ERROR: API_BEHAVIOR_BASELINE.md not found.');
  console.error('Run: pnpm tsx scripts/capture-api-baseline.ts BEFORE Phase 6.');
  process.exit(1);
}

// ── Parse baseline from markdown table ───────────────────────────────────────

interface BaselineEntry {
  method:     string;
  fullPath:   string;
  rbac:       string;
  featureFlag: string;
}

function parseBaseline(md: string): Map<string, BaselineEntry> {
  const map   = new Map<string, BaselineEntry>();
  const lines = md.split('\n');
  let inTable = false;

  for (const line of lines) {
    if (line.startsWith('| Method')) { inTable = true; continue; }
    if (line.startsWith('|---'))     { continue; }
    if (!inTable || !line.startsWith('|')) { if (inTable && !line.startsWith('|')) inTable = false; continue; }

    const cols = line.split('|').map((c) => c.trim().replace(/`/g, ''));
    if (cols.length < 5) continue;
    const [, method, fullPath, rbac, featureFlag] = cols;
    if (!method || !fullPath) continue;
    const key = `${method} ${fullPath}`;
    map.set(key, { method, fullPath, rbac: rbac ?? '', featureFlag: featureFlag ?? '' });
  }
  return map;
}

// ── Re-parse current routes (reuse logic from capture-api-baseline.ts) ───────

function parseMountPrefixes(): Map<string, string> {
  const src = readFileSync(APP_TS, 'utf8');
  const map = new Map<string, string>();
  const pattern = /app\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    map.set(m[2] ?? '', m[1] ?? '');
  }
  return map;
}

interface RouteEntry { method: string; fullPath: string; rbac: string; featureFlag: string; }

function parseRouteFile(filePath: string, mountPrefix: string): RouteEntry[] {
  const src     = readFileSync(filePath, 'utf8');
  const entries: RouteEntry[] = [];
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = routePattern.exec(src)) !== null) {
    const method   = (m[1] ?? 'GET').toUpperCase();
    const subPath  = m[2] ?? '';
    const fullPath = mountPrefix + (subPath === '/' ? '' : subPath);
    const snippet  = src.slice(m.index, m.index + 600);
    const rbac     = snippet.match(/requireRole\(\s*'([^']+)'/)?.[1] ?? '';
    const flag     = snippet.match(/FEATURE_[A-Z_]+/)?.[0] ?? '';
    entries.push({ method, fullPath, rbac, featureFlag: flag });
  }
  return entries;
}

function routerVarFromImport(appSrc: string, fileName: string): string {
  const base  = fileName.replace('.ts', '');
  const match = appSrc.match(new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*'[^']*/${base}\\.js'`));
  if (!match) return '';
  return (match[1] ?? '').split(',').map((s) => s.trim()).find((s) => s.toLowerCase().includes('router')) ?? '';
}

const appSrc        = readFileSync(APP_TS, 'utf8');
const mountPrefixes = parseMountPrefixes();
const routeFiles    = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const currentEntries: RouteEntry[] = [];
for (const file of routeFiles) {
  const baseName  = basename(file, '.ts');
  const routerVar = routerVarFromImport(appSrc, baseName);
  const prefix    = mountPrefixes.get(routerVar) ?? `/api/${baseName}`;
  currentEntries.push(...parseRouteFile(join(ROUTES_DIR, file), prefix));
}

const currentMap = new Map<string, RouteEntry>();
for (const e of currentEntries) currentMap.set(`${e.method} ${e.fullPath}`, e);

// ── Compare ───────────────────────────────────────────────────────────────────

const baselineMap = parseBaseline(readFileSync(BASELINE, 'utf8'));

const removed:  string[] = [];
const rbacChanged: string[] = [];
const added:    string[] = [];

for (const [key, base] of baselineMap) {
  const curr = currentMap.get(key);
  if (!curr) {
    removed.push(key);
  } else if (curr.rbac !== base.rbac) {
    rbacChanged.push(`${key}: was '${base.rbac}' → now '${curr.rbac}'`);
  }
}

for (const key of currentMap.keys()) {
  if (!baselineMap.has(key)) added.push(key);
}

const hasBreaking = removed.length > 0 || rbacChanged.length > 0;

// ── Write diff report ─────────────────────────────────────────────────────────

const now    = new Date().toISOString();
let   report = `# API Behavior Diff\n\n> Generated: ${now}\n> Baseline: API_BEHAVIOR_BASELINE.md\n\n`;

report += `## Result: ${hasBreaking ? '🔴 BREAKING CHANGES DETECTED' : '✅ No breaking changes'}\n\n`;

if (removed.length > 0) {
  report += `## ❌ Removed endpoints (${removed.length}) — BREAKING\n\n`;
  report += removed.map((r) => `- \`${r}\``).join('\n') + '\n\n';
}

if (rbacChanged.length > 0) {
  report += `## ❌ RBAC changed (${rbacChanged.length}) — BREAKING\n\n`;
  report += rbacChanged.map((r) => `- ${r}`).join('\n') + '\n\n';
}

if (added.length > 0) {
  report += `## ✅ New endpoints (${added.length}) — Non-breaking\n\n`;
  report += added.map((a) => `- \`${a}\``).join('\n') + '\n\n';
}

report += `## Summary\n\n| Change | Count |\n|--------|-------|\n`;
report += `| Removed (breaking) | ${removed.length} |\n`;
report += `| RBAC changed (breaking) | ${rbacChanged.length} |\n`;
report += `| Added (non-breaking) | ${added.length} |\n`;

writeFileSync(OUT_FILE, report, 'utf8');
console.log(`✓ Wrote ${OUT_FILE}`);

if (hasBreaking) {
  console.error('\n🔴 Breaking API changes detected. See API_BEHAVIOR_DIFF.md for details.');
  console.error('Breaking changes prevent merge per CLAUDE.md definition of done.');
  process.exit(1);
}

console.log('✅ No breaking API changes.');
process.exit(0);
