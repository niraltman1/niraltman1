import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, createReadStream, readFileSync } from 'node:fs';
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

describe('runIngestion — domain batch mode', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'run-domain-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  // Three laws with names that trigger distinct domains.
  const domainLaws: ValidLaw[] = [
    { israelLawId: 101, name: 'חוק העונשין, התשל"ז–1977',         isBasicLaw: false, publicationDate: '1977-07-21', validityStartDate: '1977-07-21', lastUpdated: '2024-01-01', year: 1977 },
    { israelLawId: 102, name: 'חוק שכר מינימום, התשמ"ז–1987',     isBasicLaw: false, publicationDate: '1987-04-01', validityStartDate: '1987-04-01', lastUpdated: '2024-01-01', year: 1987 },
    { israelLawId: 103, name: 'פקודת מס הכנסה [נוסח חדש]',        isBasicLaw: false, publicationDate: '1961-01-01', validityStartDate: '1961-01-01', lastUpdated: '2024-01-01', year: 1961 },
  ];

  it('3 laws spanning 3 domains → 3 domain files + corpus-domain-index.json + manifest', async () => {
    setupMocks(domainLaws);

    const summary = await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    const domainFiles = readdirSync(outDir).filter((f) => /^batch-[a-z_]+\.jsonl\.gz$/.test(f)).sort();
    expect(domainFiles).toEqual(['batch-criminal.jsonl.gz', 'batch-labor.jsonl.gz', 'batch-tax.jsonl.gz']);
    expect(existsSync(join(outDir, 'corpus-domain-index.json'))).toBe(true);
    expect(existsSync(join(outDir, 'corpus-manifest.json'))).toBe(true);
    expect(summary.written).toBe(3);

    const idx = JSON.parse(readFileSync(join(outDir, 'corpus-domain-index.json'), 'utf-8'));
    expect(idx.schemaVersion).toBe(1);
    expect(idx.totalLaws).toBe(3);
    expect(Object.keys(idx.domains).sort()).toEqual(['criminal', 'labor', 'tax']);
    expect(idx.domains['criminal'].count).toBe(1);
    expect(idx.domains['criminal'].file).toBe('batch-criminal.jsonl.gz');
    expect(idx.domains['criminal'].laws[0].israelLawId).toBe(101);
    expect(idx.domains['labor'].count).toBe(1);
    expect(idx.domains['tax'].count).toBe(1);
  });

  it('each domain file contains the correct laws', async () => {
    setupMocks(domainLaws);

    await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    const criminalLines = await readBatchLines(join(outDir, 'batch-criminal.jsonl.gz'));
    expect(criminalLines).toHaveLength(1);
    expect((criminalLines[0] as { israelLawId: number }).israelLawId).toBe(101);

    const laborLines = await readBatchLines(join(outDir, 'batch-labor.jsonl.gz'));
    expect(laborLines).toHaveLength(1);
    expect((laborLines[0] as { israelLawId: number }).israelLawId).toBe(102);

    const taxLines = await readBatchLines(join(outDir, 'batch-tax.jsonl.gz'));
    expect(taxLines).toHaveLength(1);
    expect((taxLines[0] as { israelLawId: number }).israelLawId).toBe(103);
  });

  it('artifact records carry procedureDomain field', async () => {
    setupMocks(domainLaws);

    await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    const criminalLines = await readBatchLines(join(outDir, 'batch-criminal.jsonl.gz'));
    expect((criminalLines[0] as { procedureDomain: string }).procedureDomain).toBe('criminal');

    const laborLines = await readBatchLines(join(outDir, 'batch-labor.jsonl.gz'));
    expect((laborLines[0] as { procedureDomain: string }).procedureDomain).toBe('labor');
  });

  it('resume: existing domain files are skipped, new ones written', async () => {
    // First run: only criminal law
    setupMocks(domainLaws.slice(0, 1));
    await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });
    expect(existsSync(join(outDir, 'batch-criminal.jsonl.gz'))).toBe(true);
    expect(existsSync(join(outDir, 'batch-labor.jsonl.gz'))).toBe(false);

    const mtimeBefore = statSync(join(outDir, 'batch-criminal.jsonl.gz')).mtimeMs;

    // Second run: all 3 laws — criminal already done, labor + tax written fresh
    vi.clearAllMocks();
    setupMocks(domainLaws);
    const summary = await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    expect(statSync(join(outDir, 'batch-criminal.jsonl.gz')).mtimeMs).toBe(mtimeBefore);
    expect(existsSync(join(outDir, 'batch-labor.jsonl.gz'))).toBe(true);
    expect(existsSync(join(outDir, 'batch-tax.jsonl.gz'))).toBe(true);
    // Only the 2 newly-written laws count as written (skipped domain not counted)
    expect(summary.written).toBe(2);
  });

  it('idempotent: re-running when all domain files exist writes nothing new', async () => {
    setupMocks(domainLaws);
    await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    const mtimesBefore = readdirSync(outDir)
      .filter((f) => /^batch-[a-z_]+\.jsonl\.gz$/.test(f))
      .sort()
      .map((f) => statSync(join(outDir, f)).mtimeMs);

    vi.clearAllMocks();
    setupMocks(domainLaws);
    const summary = await runIngestion({ out: outDir, domainBatches: true, delayMs: 0 });

    expect(summary.written).toBe(0); // all domain files already existed
    const mtimesAfter = readdirSync(outDir)
      .filter((f) => /^batch-[a-z_]+\.jsonl\.gz$/.test(f))
      .sort()
      .map((f) => statSync(join(outDir, f)).mtimeMs);
    expect(mtimesAfter).toEqual(mtimesBefore);
  });
});
