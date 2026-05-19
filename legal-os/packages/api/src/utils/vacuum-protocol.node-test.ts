/**
 * node:test suite for VacuumProtocol.
 * Run with: node --import tsx/esm --test src/utils/vacuum-protocol.node-test.ts
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runVacuumProtocol } from './vacuum-protocol.js';

const TMP    = join(tmpdir(), `vacuum-node-test-${randomUUID()}`);
const ORG    = join(TMP, 'org');
const SOURCE = join(TMP, 'source');

before(async () => {
  await mkdir(SOURCE, { recursive: true });
  await mkdir(ORG,    { recursive: true });
});

after(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe('VacuumProtocol — security', () => {
  it('sanitizes forbidden OS chars in folder names', async () => {
    const dir = join(TMP, 'sec-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '1234-01-2026_doc.pdf'), '%PDF-1.4\n%%EOF\n');
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true });
    for (const e of report.entries) {
      if (e.expectedPath) assert.doesNotMatch(e.expectedPath, /[*?"<>|]/);
    }
  });

  it('skips encrypted PDFs', async () => {
    const dir = join(TMP, 'enc-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '9999-01-2026_enc.pdf'), '%PDF-1.4\n/Encrypt <<>>\n%%EOF\n');
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true });
    const enc = report.entries.find((e) => e.action === 'skip_encrypted');
    assert.ok(enc, 'Expected skip_encrypted entry');
  });

  it('skips corrupt PDFs', async () => {
    const dir = join(TMP, 'corrupt-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '8888-01-2026_bad.pdf'), 'NOT_A_PDF garbage');
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true });
    const bad = report.entries.find((e) => e.action === 'skip_corrupt');
    assert.ok(bad, 'Expected skip_corrupt entry');
  });
});

describe('VacuumProtocol — dry-run', () => {
  it('detects case numbers and proposes target paths', async () => {
    const dir = join(TMP, 'dry-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '1234-05-2026_Court_Order.pdf'), '%PDF-1.4\n%%EOF\n');
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true });
    assert.ok(report.dryRun);
    const moved = report.entries.filter((e) => e.action === 'move');
    assert.ok(moved.length > 0, 'Expected at least one move entry');
    assert.equal(moved[0]?.caseNumber, '1234-05-2026');
    assert.ok(moved[0]?.expectedPath?.includes('1234-05-2026'));
  });

  it('includes EffortReport', async () => {
    const dir = join(TMP, 'effort-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '5555-03-2026_doc.pdf'), '%PDF-1.4\n%%EOF\n');
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true, ceilPercent: 95 });
    assert.ok(report.effortReport);
    assert.ok(report.effortReport.workUnits >= 1);
  });
});

describe('VacuumProtocol — stress (200 files)', () => {
  it('scans 200 nested files correctly', async () => {
    const dir = join(TMP, 'stress-src');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 200; i++) {
      const sub = join(dir, `client-${i % 10}`);
      await mkdir(sub, { recursive: true });
      await writeFile(join(sub, `${1000 + i}-05-2026_doc_${i}.pdf`), '%PDF-1.4\n%%EOF\n');
    }
    const t0 = Date.now();
    // ceilPercent:99 disables throttle pauses so the scan runs at full speed
    const report = await runVacuumProtocol({ targetDir: dir, orgDir: ORG, dryRun: true, ceilPercent: 99 });
    const elapsed = Date.now() - t0;
    assert.equal(report.scannedCount, 200);
    assert.equal(report.errors.length, 0);
    // At ceilPercent:99 CPU samples still take ~250ms each; 200 files ≈ 50s max
    assert.ok(elapsed < 90_000, `Expected < 90s, got ${elapsed}ms`);
    for (const e of report.entries) {
      assert.ok(['move','keep','pending','skip','skip_encrypted','skip_corrupt'].includes(e.action));
    }
  });
});
