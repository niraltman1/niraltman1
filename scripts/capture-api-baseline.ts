#!/usr/bin/env tsx
/**
 * capture-api-baseline.ts  (PRE-2)
 *
 * Scans all Express route files under packages/api/src/routes/ and extracts:
 *   - HTTP method
 *   - Mount path (from app.ts) + route sub-path
 *   - RBAC requirement (requireRole calls)
 *   - Feature flag guard (FEATURE_* checks)
 *
 * Writes API_BEHAVIOR_BASELINE.md at the repo root.
 * Run before Phase 6 refactoring so compare-api-baseline.ts can detect regressions.
 *
 * Usage:  pnpm tsx scripts/capture-api-baseline.ts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, '..');
const ROUTES_DIR = join(REPO_ROOT, 'packages/api/src/routes');
const APP_TS     = join(REPO_ROOT, 'packages/api/src/app.ts');
const OUT_FILE   = join(REPO_ROOT, 'API_BEHAVIOR_BASELINE.md');

// ── Parse app.ts to extract mount prefix per route file ─────────────────────

function parseMountPrefixes(): Map<string, string> {
  const src = readFileSync(APP_TS, 'utf8');
  const map = new Map<string, string>();
  // Match: app.use('/api/foo', fooRouter(...))
  const pattern = /app\.use\(\s*'([^']+)'\s*,\s*(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(src)) !== null) {
    const prefix    = m[1] ?? '';
    const routerVar = m[2] ?? '';
    // Map router variable name → prefix (e.g. 'casesRouter' → '/api/cases')
    map.set(routerVar, prefix);
  }
  return map;
}

// ── Parse a single route file ────────────────────────────────────────────────

interface RouteEntry {
  method:      string;
  fullPath:    string;
  rbac:        string;
  featureFlag: string;
}

function parseRouteFile(filePath: string, mountPrefix: string): RouteEntry[] {
  const src     = readFileSync(filePath, 'utf8');
  const entries: RouteEntry[] = [];

  // Match: router.get('/foo', ...) or router.post('/foo', requireRole(...), ...)
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let m: RegExpExecArray | null;

  while ((m = routePattern.exec(src)) !== null) {
    const method    = (m[1] ?? 'GET').toUpperCase();
    const subPath   = m[2] ?? '';
    const fullPath  = mountPrefix + (subPath === '/' ? '' : subPath);

    // Look ahead ~300 chars for requireRole
    const snippet   = src.slice(m.index, m.index + 600);
    const rbacMatch = snippet.match(/requireRole\(\s*'([^']+)'/);
    const rbac      = rbacMatch ? rbacMatch[1] ?? '' : '';

    // Look for FEATURE_* check in the next 400 chars
    const flagMatch    = snippet.match(/FEATURE_[A-Z_]+/);
    const featureFlag  = flagMatch ? flagMatch[0] : '';

    entries.push({ method, fullPath, rbac, featureFlag });
  }

  return entries;
}

// ── Discover route files and match to mount prefixes ─────────────────────────

function routerVarFromImport(appSrc: string, fileName: string): string {
  // fileName e.g. 'cases' → look for casesRouter or CasesRouter
  const base  = fileName.replace('.ts', '');
  // Pattern: import { casesRouter } from './routes/cases.js'
  const importPattern = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*'[^']*/${base}\\.js'`);
  const importMatch   = appSrc.match(importPattern);
  if (!importMatch) return '';
  // May export multiple symbols — pick the first that ends in 'Router'
  const symbols = (importMatch[1] ?? '').split(',').map((s) => s.trim());
  return symbols.find((s) => s.toLowerCase().includes('router')) ?? '';
}

// ── Main ─────────────────────────────────────────────────────────────────────

const appSrc       = readFileSync(APP_TS, 'utf8');
const mountPrefixes = parseMountPrefixes();

const routeFiles = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'));

const allEntries: RouteEntry[] = [];

for (const file of routeFiles.sort()) {
  const filePath  = join(ROUTES_DIR, file);
  const baseName  = basename(file, '.ts');
  const routerVar = routerVarFromImport(appSrc, baseName);
  const prefix    = mountPrefixes.get(routerVar) ?? `/api/${baseName}`;
  const entries   = parseRouteFile(filePath, prefix);
  allEntries.push(...entries);
}

// Sort by path then method
allEntries.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));

// ── Generate markdown ─────────────────────────────────────────────────────────

const now = new Date().toISOString();

const header = `# API Behavior Baseline

> Generated: ${now}
> Source: packages/api/src/routes/
> Do not edit manually — regenerate with: \`pnpm tsx scripts/capture-api-baseline.ts\`
>
> This baseline is compared after Phase 6 refactoring by \`scripts/compare-api-baseline.ts\`.
> Breaking changes (removed endpoints, changed methods, changed RBAC) fail CI.

## Route Inventory (${allEntries.length} endpoints)

| Method | Endpoint | RBAC | Feature Flag |
|--------|----------|------|--------------|
`;

const rows = allEntries
  .map((e) => `| \`${e.method}\` | \`${e.fullPath}\` | ${e.rbac || '—'} | ${e.featureFlag || '—'} |`)
  .join('\n');

const footer = `

## Summary

| Item | Count |
|------|-------|
| Total endpoints | ${allEntries.length} |
| GET  | ${allEntries.filter((e) => e.method === 'GET').length} |
| POST | ${allEntries.filter((e) => e.method === 'POST').length} |
| PUT  | ${allEntries.filter((e) => e.method === 'PUT').length} |
| PATCH | ${allEntries.filter((e) => e.method === 'PATCH').length} |
| DELETE | ${allEntries.filter((e) => e.method === 'DELETE').length} |
| Admin-only (requireRole admin) | ${allEntries.filter((e) => e.rbac === 'admin').length} |
| Attorney+ (requireRole attorney) | ${allEntries.filter((e) => e.rbac === 'attorney').length} |
| Feature-flagged | ${allEntries.filter((e) => e.featureFlag).length} |
`;

writeFileSync(OUT_FILE, header + rows + footer, 'utf8');
console.log(`✓ Wrote ${OUT_FILE} (${allEntries.length} endpoints)`);
