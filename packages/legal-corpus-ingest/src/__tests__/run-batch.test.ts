import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

// Mock all network I/O — tests run fully offline.
vi.mock('../odata-registry.js', () => ({
  ODATA_BASE: 'http://test-odata.example',
  iterateValidLaws: vi.fn(),
}));
vi.mock('../wiki-resolve.js', () => ({
  resolveLaw: vi.fn(),
}));

import { runIngestion } from '../run.js';
import { iterateValidLaws } from '../odata-registry.js';
import { resolveLaw } from '../wiki-resolve.js';
import type { ValidLaw } from '../odata-registry.js';

const mockIterateLaws = vi.mocked(iterateValidLaws);
const mockResolveLaw  = vi.mocked(resolveLaw);

function makeLaw(israelLawId: number): ValidLaw {
  return {
    israelLawId,
    name: `חוק מספר ${israelLawId}, התשפ"ו–2026`,
    isBasicLaw: false,
    publicationDate: '2026-01-01',
    validityStartDate: '2026-01-01',
    lastUpdated: '2026-01-01',
    year: 2026,
  };
}

function setupMocks(laws: ValidLaw[]): void {
  mockIterateLaws.mockImplementation(async function* () {
    for (const law of laws) yield law;
  });
  mockResolveLaw.mockResolvedValue({ matched: false, transient: false, reason: 'no-page' });
}

async function readBatchLines(filePath: string): Promise<unknown[]> {
  const input = createReadStream(filePath).pipe(createGunzip());
  const rl    = createInterface({ input, crlfDelay: Infinity });
  const lines: unknown[] = [];
  for await (const line of rl) {
    if (line.trim()) lines.push(JSON.parse(line));
  }
  return lines;
}

describe('runIngestion — batch mode', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'run-batch-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('happy path: 30 laws at batch-size 10 → 3 batch files + manifest', async () => {
    const laws = Array.from({ length: 30 }, (_, i) => makeLaw(i + 1));
    setupMocks(laws);

    const summary = await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });

    const batchFiles = readdirSync(outDir).filter((f) => /^batch-\d{4}\.jsonl\.gz$/.test(f)).sort();
    expect(batchFiles).toEqual(['batch-0001.jsonl.gz', 'batch-0002.jsonl.gz', 'batch-0003.jsonl.gz']);
    expect(existsSync(join(outDir, 'corpus-manifest.json'))).toBe(true);
    expect(summary.written).toBe(30);

    for (const file of batchFiles) {
      const lines = await readBatchLines(join(outDir, file));
      expect(lines).toHaveLength(10);
    }
  });

  it('resume: batch-0001 already exists → skipped; batches 2 and 3 written fresh', async () => {
    const laws = Array.from({ length: 30 }, (_, i) => makeLaw(i + 1));

    // First run: only the first 10 laws → creates batch-0001 only.
    setupMocks(laws.slice(0, 10));
    await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });
    expect(existsSync(join(outDir, 'batch-0001.jsonl.gz'))).toBe(true);
    expect(existsSync(join(outDir, 'batch-0002.jsonl.gz'))).toBe(false);

    const mtimeBefore = statSync(join(outDir, 'batch-0001.jsonl.gz')).mtimeMs;

    // Second run: all 30 laws → batch-0001 already exists, batches 2-3 created.
    vi.clearAllMocks();
    setupMocks(laws);
    await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });

    expect(statSync(join(outDir, 'batch-0001.jsonl.gz')).mtimeMs).toBe(mtimeBefore);
    expect(existsSync(join(outDir, 'batch-0002.jsonl.gz'))).toBe(true);
    expect(existsSync(join(outDir, 'batch-0003.jsonl.gz'))).toBe(true);
  });

  it('idempotent: re-running when all batches exist writes nothing new', async () => {
    const laws = Array.from({ length: 30 }, (_, i) => makeLaw(i + 1));
    setupMocks(laws);

    await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });
    const mtimesBefore = readdirSync(outDir)
      .filter((f) => /^batch-\d{4}\.jsonl\.gz$/.test(f))
      .sort()
      .map((f) => statSync(join(outDir, f)).mtimeMs);

    vi.clearAllMocks();
    setupMocks(laws);
    const summary = await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });

    expect(summary.written).toBe(0); // all batches skipped
    const mtimesAfter = readdirSync(outDir)
      .filter((f) => /^batch-\d{4}\.jsonl\.gz$/.test(f))
      .sort()
      .map((f) => statSync(join(outDir, f)).mtimeMs);
    expect(mtimesAfter).toEqual(mtimesBefore);
  });

  it('partial batch: 25 laws at batch-size 10 → 3 files (10 + 10 + 5)', async () => {
    const laws = Array.from({ length: 25 }, (_, i) => makeLaw(i + 1));
    setupMocks(laws);

    const summary = await runIngestion({ out: outDir, batchSize: 10, delayMs: 0 });

    const batchFiles = readdirSync(outDir).filter((f) => /^batch-\d{4}\.jsonl\.gz$/.test(f)).sort();
    expect(batchFiles).toHaveLength(3);

    const counts = await Promise.all(
      batchFiles.map((f) => readBatchLines(join(outDir, f)).then((lines) => lines.length)),
    );
    expect(counts).toEqual([10, 10, 5]);
    expect(summary.written).toBe(25);
  });
});
