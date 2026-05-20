#!/usr/bin/env node
// ci-error-formatter.mjs
// Runs all CI checks and outputs a single structured JSON file for Claude Code.
// Usage: node ci-error-formatter.mjs
// Output: _ci-errors.json (only errors, nothing else)

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const OUTPUT_FILE = '_ci-errors.json';
const errors = [];

function run(label, command) {
  console.log(`Running: ${label}...`);
  try {
    execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    console.log(`✅ ${label} passed`);
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    const parsed = parseErrors(label, output);
    errors.push(...parsed);
    console.log(`❌ ${label} failed — ${parsed.length} error(s) found`);
  }
}

function parseErrors(tool, rawOutput) {
  const lines = rawOutput.split('\n').filter(Boolean);
  const results = [];

  for (const line of lines) {
    // TypeScript errors: path/to/file.ts(LINE,COL): error TSXXXX: message
    const tsMatch = line.match(/^(.+\.tsx?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/);
    if (tsMatch) {
      results.push({
        tool,
        severity: tsMatch[4],
        file: tsMatch[1],
        line: parseInt(tsMatch[2]),
        col: parseInt(tsMatch[3]),
        code: tsMatch[5],
        message: tsMatch[6].trim(),
      });
      continue;
    }

    // ESLint errors: /path/to/file.ts  LINE:COL  error  message  rule
    const eslintMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$/);
    if (eslintMatch && results.length > 0 && results[results.length - 1].tool === tool) {
      const lastFile = results[results.length - 1].file;
      results.push({
        tool,
        severity: eslintMatch[3],
        file: lastFile,
        line: parseInt(eslintMatch[1]),
        col: parseInt(eslintMatch[2]),
        code: eslintMatch[5].trim(),
        message: eslintMatch[4].trim(),
      });
      continue;
    }

    // ESLint file header: /absolute/path/to/file.ts
    const eslintFile = line.match(/^(\/[^\s]+\.tsx?)$/);
    if (eslintFile) {
      // Store for next error lines — push a placeholder
      results.push({ tool, _fileHeader: eslintFile[1] });
      continue;
    }
  }

  // Remove file header placeholders
  return results.filter(e => !e._fileHeader);
}

// ─── Run all checks ───────────────────────────────────────────────────────────

run('TypeScript (all packages)', 'pnpm typecheck 2>&1');
run('ESLint', 'pnpm lint 2>&1');
run('Build', 'pnpm build 2>&1');

// ─── Write output ─────────────────────────────────────────────────────────────

const summary = {
  timestamp: new Date().toISOString(),
  total_errors: errors.filter(e => e.severity === 'error').length,
  total_warnings: errors.filter(e => e.severity === 'warning').length,
  errors_by_package: groupByPackage(errors),
  all_errors: errors,
};

writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));

console.log('\n─────────────────────────────────────');
if (errors.length === 0) {
  console.log('✅ All checks passed. No errors found.');
} else {
  console.log(`❌ ${summary.total_errors} error(s), ${summary.total_warnings} warning(s) found.`);
  console.log(`📄 Full error report written to: ${OUTPUT_FILE}`);
  console.log('\nTop errors:');
  errors
    .filter(e => e.severity === 'error')
    .slice(0, 5)
    .forEach(e => console.log(`  ${e.file}:${e.line} — ${e.message}`));
}
console.log('─────────────────────────────────────\n');

process.exit(errors.filter(e => e.severity === 'error').length > 0 ? 1 : 0);

function groupByPackage(errors) {
  const groups = {};
  for (const e of errors) {
    if (!e.file) continue;
    const pkg = e.file.match(/packages\/([^/]+)/)?.[1] || 
                e.file.match(/apps\/([^/]+)/)?.[1] || 
                'root';
    groups[pkg] = groups[pkg] || { errors: 0, warnings: 0, files: new Set() };
    groups[pkg][e.severity === 'error' ? 'errors' : 'warnings']++;
    groups[pkg].files.add(e.file);
  }
  // Convert Sets to arrays for JSON serialization
  for (const pkg of Object.keys(groups)) {
    groups[pkg].files = [...groups[pkg].files];
  }
  return groups;
}
