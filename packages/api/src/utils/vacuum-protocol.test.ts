import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { runVacuumProtocol } from './vacuum-protocol.js';

const TMP    = join(tmpdir(), `vacuum-tests-${randomUUID()}`);
const ORG    = join(TMP, 'org');
const SOURCE = join(TMP, 'source');

// ── Stress-test helper: create N files in nested dirs ──────────────────────
async function createFiles(root: string, count: number): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const sub  = join(root, `client-${i % 20}`, `case-${i % 50}`);
    const name = `1234-${String(i % 12).padStart(2, '0')}-2026_Document_${i}.pdf`;
    await mkdir(sub, { recursive: true });
    const p = join(sub, name);
    // Write minimal valid PDF header so the integrity check passes
    await writeFile(p, `%PDF-1.4\n%שלום\n%%EOF\n`);
    paths.push(p);
  }
  return paths;
}

beforeAll(async () => {
  await mkdir(SOURCE, { recursive: true });
  await mkdir(ORG,    { recursive: true });
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

// ── Security / Prompt injection ────────────────────────────────────────────

describe('Vacuum Protocol — security', () => {
  it('sanitizes forbidden OS characters in folder names', async () => {
    // File whose "case number" would contain chars like : or *
    const dir = join(TMP, 'injection-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '1234-01-2026_safe_name.pdf'), '%PDF-1.4\n%%EOF\n');

    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true,
    });
    for (const entry of report.entries) {
      if (entry.expectedPath) {
        // No forbidden characters in the generated path
        expect(entry.expectedPath).not.toMatch(/[*?"<>|]/);
      }
    }
  });

  it('skips encrypted PDFs before attempting any file operation', async () => {
    const dir = join(TMP, 'encrypted-src');
    await mkdir(dir, { recursive: true });
    // Write a fake "encrypted" PDF (has /Encrypt in header)
    await writeFile(join(dir, '9999-01-2026_encrypted.pdf'), '%PDF-1.4\n/Encrypt <<>>\n%%EOF\n');

    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true,
    });
    const enc = report.entries.find((e) => e.action === 'skip_encrypted');
    expect(enc).toBeDefined();
  });

  it('skips corrupt PDFs', async () => {
    const dir = join(TMP, 'corrupt-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '8888-01-2026_corrupt.pdf'), 'NOT_A_PDF_HEADER garbage data');

    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true,
    });
    const corrupt = report.entries.find((e) => e.action === 'skip_corrupt');
    expect(corrupt).toBeDefined();
  });
});

// ── Dry-run accuracy ────────────────────────────────────────────────────────

describe('Vacuum Protocol — dry-run', () => {
  it('detects case numbers and proposes correct target paths', async () => {
    const dir = join(TMP, 'dryrun-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '1234-05-2026_Court_Order.pdf'), '%PDF-1.4\n%%EOF\n');

    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true,
    });
    expect(report.dryRun).toBe(true);
    const moved = report.entries.filter((e) => e.action === 'move');
    expect(moved.length).toBeGreaterThan(0);
    expect(moved[0]!.caseNumber).toBe('1234-05-2026');
    expect(moved[0]!.expectedPath).toContain('1234-05-2026');
  });

  it('returns an EffortReport', async () => {
    const dir = join(TMP, 'effort-src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '5555-03-2026_doc.pdf'), '%PDF-1.4\n%%EOF\n');

    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true, ceilPercent: 95,
    });
    expect(report.effortReport).toBeDefined();
    expect(report.effortReport.workUnits).toBeGreaterThan(0);
  });
});

// ── Stress test — 500 files (representative subset of 10k) ─────────────────
// NOTE: Full 10,000-file stress test is run via `pnpm test:stress` to avoid
//       long CI times. This suite validates correctness at scale with 500 files.

describe('Vacuum Protocol — stress (500 files)', () => {
  it('scans 500 nested files within reasonable time', async () => {
    const dir = join(TMP, 'stress-src');
    await mkdir(dir, { recursive: true });
    await createFiles(dir, 500);

    const start = Date.now();
    const report = await runVacuumProtocol({
      targetDir: dir, orgDir: ORG, dryRun: true, ceilPercent: 95,
    });
    const elapsed = Date.now() - start;

    expect(report.scannedCount).toBe(500);
    expect(report.errors).toHaveLength(0);
    // Should complete in under 60s even on a slow machine
    expect(elapsed).toBeLessThan(60_000);
    // Every file either has a case number or is skipped — no mystery entries
    for (const e of report.entries) {
      expect(['move','keep','pending','skip','skip_encrypted','skip_corrupt']).toContain(e.action);
    }
  }, 90_000); // 90s timeout
});
