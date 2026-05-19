#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot   = join(__dirname, '..');

function getGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return 'unknown';
  }
}

async function writeAtomic(dest, content) {
  const tmp = dest + '.tmp';
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, dest);
}

const payload = JSON.stringify({
  name:                 'Factum IL Beta',
  version:              '1.0.0-beta',
  buildTimestamp:       new Date().toISOString(),
  gitSha:               getGitSha(),
  lastComplianceUpdate: '2026-05-19',
}, null, 2);

const dashboardDest = join(repoRoot, 'apps', 'dashboard', 'public', 'version.json');
const apiDest       = join(repoRoot, 'packages', 'api', 'src', 'generated', 'version.json');

await Promise.all([
  writeAtomic(dashboardDest, payload),
  writeAtomic(apiDest, payload),
]);

console.log('version.json written to dashboard/public and packages/api/src/generated');
