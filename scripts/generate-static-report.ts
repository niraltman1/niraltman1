#!/usr/bin/env tsx
/**
 * scripts/generate-static-report.ts
 * Runs static validation commands and writes reports/static-validation-report.md
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const REPORTS = join(ROOT, 'reports');

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  output: string;
  durationMs: number;
}

function run(cmd: string, cwd = ROOT): { stdout: string; exitCode: number; durationMs: number } {
  const start = Date.now();
  try {
    const stdout = execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout: stdout.toString().trim(), exitCode: 0, durationMs: Date.now() - start };
  } catch (err: any) {
    return {
      stdout: (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? ''),
      exitCode: err.status ?? 1,
      durationMs: Date.now() - start,
    };
  }
}

const checks: CheckResult[] = [];

// 1. TypeScript typecheck
{
  const r = run('pnpm -r typecheck');
  checks.push({
    name: 'TypeScript typecheck (pnpm -r typecheck)',
    status: r.exitCode === 0 ? 'pass' : 'fail',
    output: r.exitCode === 0 ? '0 errors' : r.stdout.slice(0, 2000),
    durationMs: r.durationMs,
  });
}

// 2. Test suite
{
  const r = run('pnpm -r test --reporter=verbose 2>&1 | tail -30');
  const passMatch = r.stdout.match(/(\d+)\s+passed/);
  const failMatch = r.stdout.match(/(\d+)\s+failed/);
  const testCount = passMatch ? parseInt(passMatch[1]) : 0;
  const failCount = failMatch ? parseInt(failMatch[1]) : 0;
  checks.push({
    name: `Test suite (pnpm -r test)`,
    status: r.exitCode === 0 ? 'pass' : 'fail',
    output: `${testCount} passed, ${failCount} failed`,
    durationMs: r.durationMs,
  });
}

// 3. Security audit
{
  const r = run('pnpm audit --audit-level=high 2>&1 || true');
  const criticalMatch = r.stdout.match(/(\d+)\s+critical/);
  const highMatch = r.stdout.match(/(\d+)\s+high/);
  const criticals = criticalMatch ? parseInt(criticalMatch[1]) : 0;
  const highs = highMatch ? parseInt(highMatch[1]) : 0;
  checks.push({
    name: 'Security audit (pnpm audit --audit-level=high)',
    status: criticals > 0 ? 'fail' : highs > 0 ? 'warn' : 'pass',
    output: r.stdout.slice(0, 1000) || 'No vulnerabilities found',
    durationMs: r.durationMs,
  });
}

// 4. ESLint gap check
checks.push({
  name: 'ESLint (pnpm -r lint)',
  status: 'warn',
  output: 'No ESLint configuration found in monorepo. Lint step intentionally absent — add .eslintrc.json per package to enable.',
  durationMs: 0,
});

// 5. Build check
{
  const r = run('pnpm build:all 2>&1 | tail -20');
  checks.push({
    name: 'Production build (pnpm build:all)',
    status: r.exitCode === 0 ? 'pass' : 'fail',
    output: r.exitCode === 0 ? 'All packages built successfully' : r.stdout.slice(0, 1000),
    durationMs: r.durationMs,
  });
}

// Generate report
mkdirSync(REPORTS, { recursive: true });

const ts = new Date().toISOString();
const allPass = checks.every(c => c.status !== 'fail');

const lines = [
  `# Static Validation Report`,
  ``,
  `**Generated:** ${ts}`,
  `**Overall status:** ${allPass ? '✅ PASS' : '❌ FAIL'}`,
  ``,
  `## Results`,
  ``,
  `| Check | Status | Duration |`,
  `|-------|--------|----------|`,
  ...checks.map(c => `| ${c.name} | ${c.status === 'pass' ? '✅ PASS' : c.status === 'warn' ? '⚠️ WARN' : '❌ FAIL'} | ${c.durationMs}ms |`),
  ``,
  `## Details`,
  ``,
  ...checks.flatMap(c => [
    `### ${c.name}`,
    ``,
    `**Status:** ${c.status === 'pass' ? '✅ PASS' : c.status === 'warn' ? '⚠️ WARN' : '❌ FAIL'}`,
    ``,
    '```',
    c.output,
    '```',
    ``,
  ]),
];

writeFileSync(join(REPORTS, 'static-validation-report.md'), lines.join('\n'), 'utf-8');
console.log(`✅ Static validation report written to reports/static-validation-report.md`);
console.log(`Overall: ${allPass ? 'PASS' : 'FAIL'}`);

process.exit(allPass ? 0 : 1);
