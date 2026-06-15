#!/usr/bin/env tsx
/**
 * check-architecture.ts — Architecture validation for Factum-IL.
 *
 * Critical violations (exit code 1, blocks CI):
 *   - db.prepare( calls in packages/api/src/routes/*.ts (unless allowlisted)
 *   - import of apps/dashboard from non-dashboard package source files
 *
 * Warnings (exit code 0, report only):
 *   - Route files exceeding 120 non-blank lines
 *   - .map(, .filter(, .reduce( chains (3+) in route handlers
 *
 * Writes ARCHITECTURE_AUDIT.md at the repo root.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Configuration ──────────────────────────────────────────────────────────────

const _dir     = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(_dir, '..');
const ROUTES_DIR = join(REPO_ROOT, 'packages', 'api', 'src', 'routes');

/**
 * Files that are permitted to use db.prepare() directly in route handlers
 * by intentional design (health checks, migration introspection, etc.).
 */
const DB_PREPARE_ALLOWLIST = new Set([
  'diagnostics.ts',
  'setup.ts',
  'updates.ts',
  'citations.ts',
  'communications.ts',
]);

const LOC_LIMIT = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Violation {
  file: string;
  severity: 'CRITICAL' | 'WARNING';
  rule: string;
  detail: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countNonBlankLines(content: string): number {
  return content.split('\n').filter((l) => l.trim().length > 0).length;
}

function stripLineComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('//');
      if (commentIdx === -1) return line;
      const before = line.slice(0, commentIdx);
      const singleQuotes = (before.match(/'/g) ?? []).length;
      const doubleQuotes = (before.match(/"/g) ?? []).length;
      const backticks    = (before.match(/`/g) ?? []).length;
      if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0 && backticks % 2 === 0) {
        return before;
      }
      return line;
    })
    .join('\n');
}

// ── Route file scanner ────────────────────────────────────────────────────────

function scanRoutesDir(): Violation[] {
  const violations: Violation[] = [];

  let files: string[];
  try {
    files = readdirSync(ROUTES_DIR).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
  } catch (err) {
    console.error(`[ERROR] Cannot read routes dir: ${ROUTES_DIR}`, err);
    process.exit(1);
  }

  for (const file of files) {
    if (file === '__tests__') continue;

    const filePath = join(ROUTES_DIR, file);
    const content  = readFileSync(filePath, 'utf8');
    const stripped = stripLineComments(content);
    const relPath  = relative(REPO_ROOT, filePath);
    const fname    = basename(file);

    // ── Critical: db.prepare( in route files (not in allowlist) ──────────────
    if (!DB_PREPARE_ALLOWLIST.has(fname)) {
      const lines = stripped.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes('db.prepare(')) {
          violations.push({
            file:     relPath,
            severity: 'CRITICAL',
            rule:     'NO_DIRECT_SQL_IN_ROUTES',
            detail:   `Line ${idx + 1}: direct db.prepare() call — use a Repository method instead`,
          });
        }
      });
    }

    // ── Warning: LOC > 120 ────────────────────────────────────────────────────
    const loc = countNonBlankLines(content);
    if (loc > LOC_LIMIT) {
      violations.push({
        file:     relPath,
        severity: 'WARNING',
        rule:     'ROUTE_TOO_LONG',
        detail:   `${loc} non-blank lines (limit: ${LOC_LIMIT}) — split into handler modules`,
      });
    }

    // ── Warning: chained array combinators in route handlers ──────────────────
    const chainPattern = /\.(map|filter|reduce)\s*\(/g;
    const chainMatches = stripped.match(chainPattern);
    if (chainMatches && chainMatches.length >= 3) {
      violations.push({
        file:     relPath,
        severity: 'WARNING',
        rule:     'ARRAY_CHAIN_IN_ROUTE',
        detail:   `${chainMatches.length} .map/.filter/.reduce calls — consider moving to a utility module`,
      });
    }
  }

  return violations;
}

// ── Dashboard import scanner ──────────────────────────────────────────────────

function scanDashboardImports(): Violation[] {
  const violations: Violation[] = [];
  const packagesDir = join(REPO_ROOT, 'packages');

  function walkDir(dir: string): void {
    const dirEntries = readdirSync(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walkDir(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const content = readFileSync(fullPath, 'utf8');
        const dashboardPath = join(REPO_ROOT, 'apps', 'dashboard');
        if (!fullPath.startsWith(dashboardPath)) {
          const importPattern = /from\s+['"][^'"]*apps\/dashboard[^'"]*['"]/g;
          const matches = content.match(importPattern);
          if (matches) {
            const relPath = relative(REPO_ROOT, fullPath);
            violations.push({
              file:     relPath,
              severity: 'CRITICAL',
              rule:     'NO_DASHBOARD_IMPORT_FROM_PACKAGES',
              detail:   `Cross-boundary import of apps/dashboard detected: ${matches[0] ?? ''}`,
            });
          }
        }
      }
    }
  }

  try {
    walkDir(packagesDir);
  } catch (err) {
    console.error('[WARNING] Could not scan packages for dashboard imports:', err);
  }

  return violations;
}

// ── Report generation ─────────────────────────────────────────────────────────

function generateMarkdownReport(violations: Violation[]): string {
  const now = new Date().toISOString();
  const criticals = violations.filter((v) => v.severity === 'CRITICAL');
  const warnings  = violations.filter((v) => v.severity === 'WARNING');

  const lines: string[] = [
    '# Architecture Audit Report',
    '',
    `Generated: ${now}`,
    '',
    '## Summary',
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| CRITICAL | ${criticals.length} |`,
    `| WARNING  | ${warnings.length} |`,
    '',
  ];

  if (violations.length === 0) {
    lines.push('> No violations found. Architecture is healthy.');
    lines.push('');
  } else {
    lines.push('## Violations');
    lines.push('');
    lines.push('| Severity | File | Rule | Detail |');
    lines.push('|----------|------|------|--------|');
    for (const v of violations) {
      const escapedDetail = v.detail.replace(/\|/g, '\\|');
      lines.push(`| **${v.severity}** | \`${v.file}\` | \`${v.rule}\` | ${escapedDetail} |`);
    }
    lines.push('');
  }

  lines.push('## Allowlisted Files (db.prepare permitted)');
  lines.push('');
  for (const f of DB_PREPARE_ALLOWLIST) {
    lines.push(`- \`packages/api/src/routes/${f}\` — direct DB access by design`);
  }
  lines.push('');

  lines.push('## Rules Reference');
  lines.push('');
  lines.push('| Rule | Severity | Description |');
  lines.push('|------|----------|-------------|');
  lines.push('| `NO_DIRECT_SQL_IN_ROUTES` | CRITICAL | Route files must not call `db.prepare()` — use Repository classes |');
  lines.push('| `NO_DASHBOARD_IMPORT_FROM_PACKAGES` | CRITICAL | Package source must not import from `apps/dashboard` |');
  lines.push('| `ROUTE_TOO_LONG` | WARNING | Route files > 120 non-blank lines should be refactored |');
  lines.push('| `ARRAY_CHAIN_IN_ROUTE` | WARNING | Heavy array chaining in routes should move to utility modules |');
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Factum-IL Architecture Guard');
  console.log('============================');
  console.log(`Scanning: ${ROUTES_DIR}`);
  console.log('');

  const routeViolations     = scanRoutesDir();
  const dashboardViolations = scanDashboardImports();
  const allViolations       = [...routeViolations, ...dashboardViolations];

  for (const v of allViolations) {
    const prefix = v.severity === 'CRITICAL' ? '[CRITICAL]' : '[WARNING]';
    console.log(`${prefix} ${v.file}`);
    console.log(`         Rule: ${v.rule}`);
    console.log(`         ${v.detail}`);
    console.log('');
  }

  const criticalCount = allViolations.filter((v) => v.severity === 'CRITICAL').length;
  const warningCount  = allViolations.filter((v) => v.severity === 'WARNING').length;

  console.log(`Results: ${criticalCount} critical, ${warningCount} warnings`);

  const reportPath = join(REPO_ROOT, 'ARCHITECTURE_AUDIT.md');
  const report     = generateMarkdownReport(allViolations);
  writeFileSync(reportPath, report, 'utf8');
  console.log(`Report written → ${reportPath}`);

  if (criticalCount > 0) {
    console.error(`\nArchitecture check FAILED: ${criticalCount} critical violation(s) must be fixed before merge.`);
    process.exit(1);
  } else {
    console.log('\nArchitecture check passed.');
    process.exit(0);
  }
}

main();
