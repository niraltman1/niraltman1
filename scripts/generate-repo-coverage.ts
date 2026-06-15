#!/usr/bin/env tsx
/**
 * generate-repo-coverage.ts — Generates REPOSITORY_COVERAGE.md
 *
 * Scans the database package to:
 *   1. Discover all Repository classes and the query files they live in
 *   2. Infer which database tables each repository accesses (from SQL strings)
 *   3. Check which repositories are imported elsewhere in the codebase
 *   4. Write a markdown report with the Repository → Table mapping + coverage analysis
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Configuration ──────────────────────────────────────────────────────────────

const _dir         = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT     = resolve(_dir, '..');
const DB_QUERIES_DIR = join(REPO_ROOT, 'packages', 'database', 'src', 'queries');
const PACKAGES_DIR   = join(REPO_ROOT, 'packages');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RepositoryInfo {
  className:  string;
  sourceFile: string;     // relative path
  tablesUsed: string[];   // tables inferred from SQL strings
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/** Extract Repository class names declared in a file. */
function extractRepositoryClasses(content: string): string[] {
  const pattern = /export\s+class\s+(\w+Repository)\b/g;
  const classes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1] !== undefined) classes.push(match[1]);
  }
  return classes;
}

/** Extract table names from SQL strings in a file (rough heuristic). */
function extractTableNames(content: string): string[] {
  const tables = new Set<string>();

  const fromPattern = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([A-Z][A-Za-z_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = fromPattern.exec(content)) !== null) {
    const candidate = match[1];
    if (candidate !== undefined && !['SELECT', 'WHERE', 'VALUES', 'SET', 'ON', 'AND', 'OR', 'NOT', 'NULL'].includes(candidate)) {
      tables.add(candidate);
    }
  }

  const createPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Z][A-Za-z_]+)/g;
  while ((match = createPattern.exec(content)) !== null) {
    if (match[1] !== undefined) tables.add(match[1]);
  }

  return [...tables].sort();
}

/** Recursively find all .ts source files (non-test) in a directory. */
function findSourceFiles(dir: string, results: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      findSourceFiles(fullPath, results);
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.node-test.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

function scanRepositories(): RepositoryInfo[] {
  const repos: RepositoryInfo[] = [];

  let queryFiles: string[];
  try {
    queryFiles = readdirSync(DB_QUERIES_DIR).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
  } catch (err) {
    console.error(`[ERROR] Cannot read queries dir: ${DB_QUERIES_DIR}`, err);
    return repos;
  }

  for (const file of queryFiles) {
    const filePath = join(DB_QUERIES_DIR, file);
    const content  = readFileSafe(filePath);
    const classes  = extractRepositoryClasses(content);

    if (classes.length === 0) continue;

    const tables  = extractTableNames(content);
    const relPath = relative(REPO_ROOT, filePath);

    for (const className of classes) {
      repos.push({ className, sourceFile: relPath, tablesUsed: tables });
    }
  }

  return repos;
}

// ── Report generation ─────────────────────────────────────────────────────────

function generateReport(repos: RepositoryInfo[], allSourceFiles: string[]): string {
  const now = new Date().toISOString();

  const usedClasses:   Set<string> = new Set();
  const unusedClasses: Set<string> = new Set();

  for (const repo of repos) {
    const pattern = new RegExp(`\\b${repo.className}\\b`);
    const importers = allSourceFiles.filter((f) => {
      if (f.includes('packages/database/src/queries/')) return false;
      return pattern.test(readFileSafe(f));
    });
    if (importers.length > 0) {
      usedClasses.add(repo.className);
    } else {
      unusedClasses.add(repo.className);
    }
  }

  const lines: string[] = [
    '# Repository Coverage Report',
    '',
    `Generated: ${now}`,
    '',
    `Scanned \`${relative(REPO_ROOT, DB_QUERIES_DIR)}\` — found **${repos.length}** repository class(es).`,
    '',
    '## Repository → Table Mapping',
    '',
    '| Repository Class | Source File | Tables Used |',
    '|------------------|-------------|-------------|',
  ];

  for (const repo of repos.sort((a, b) => a.className.localeCompare(b.className))) {
    const tableList = repo.tablesUsed.length > 0
      ? repo.tablesUsed.map((t) => `\`${t}\``).join(', ')
      : '_none detected_';
    lines.push(`| \`${repo.className}\` | \`${repo.sourceFile}\` | ${tableList} |`);
  }

  lines.push('');
  lines.push('## Import Coverage');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Referenced outside \`packages/database\` | ${usedClasses.size} |`);
  lines.push(`| Defined but not imported elsewhere | ${unusedClasses.size} |`);
  lines.push('');

  if (unusedClasses.size > 0) {
    lines.push('### Repositories not imported outside `packages/database`');
    lines.push('');
    lines.push('> These may be dead code or only consumed internally by the database package.');
    lines.push('');
    for (const cls of [...unusedClasses].sort()) {
      lines.push(`- \`${cls}\``);
    }
    lines.push('');
  } else {
    lines.push('> All repositories are referenced outside `packages/database`. No dead code detected.');
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- Table names are inferred from SQL string literals via regex (FROM, JOIN, INTO, UPDATE, CREATE TABLE).');
  lines.push('- Import coverage is determined by checking for the class name across all non-test TypeScript source files.');
  lines.push('- "Not imported" does not necessarily mean dead code — some classes may be re-exported via an index barrel.');
  lines.push('');

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Factum-IL Repository Coverage Generator');
  console.log('========================================');

  const repos = scanRepositories();
  console.log(`Found ${repos.length} repository class(es) in packages/database/src/queries/`);

  let allSourceFiles: string[] = [];
  try {
    allSourceFiles = findSourceFiles(PACKAGES_DIR);
    console.log(`Scanning ${allSourceFiles.length} source files for import references...`);
  } catch (err) {
    console.error('[WARNING] Could not scan packages dir:', err);
  }

  const report     = generateReport(repos, allSourceFiles);
  const reportPath = join(REPO_ROOT, 'REPOSITORY_COVERAGE.md');
  writeFileSync(reportPath, report, 'utf8');

  console.log(`Report written → ${reportPath}`);
}

main();
