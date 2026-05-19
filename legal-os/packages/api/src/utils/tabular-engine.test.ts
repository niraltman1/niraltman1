import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { ingestTabularFile } from './tabular-engine.js';

// ── Minimal stub repositories ─────────────────────────────────────────────────
const docStore: Record<string, unknown> = {};
const pfStore:  Record<string, unknown> = {};

const mockDocs = {
  findByHash:    (_h: string) => null,
  create:        (data: unknown) => { const id = Object.keys(docStore).length + 1; docStore[id] = data; return { id }; },
} as unknown as import('@legal-os/database').DocumentRepository;

const mockPf = {
  findByHash:    (_h: string) => null,
  register:      (data: unknown) => { pfStore['reg'] = data; },
  updateStatus:  () => {},
} as unknown as import('@legal-os/database').ProcessedFilesRepository;

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TMP = join(tmpdir(), `legal-os-tests-${randomUUID()}`);
let csvPath   = '';
let xlsxPath  = '';

beforeAll(async () => {
  await mkdir(TMP, { recursive: true });

  // ── CSV fixture: 5 rows with Hebrew legal data ──────────────────────────
  csvPath = join(TMP, 'test-legal.csv');
  const csvContent = [
    'מספר תיק,שם לקוח,עו"ד,תאריך',
    '1234-05-2026,כהן יוסף,עו"ד אבי לוי,15.05.2026',
    'ת"פ 567,לוי דוד,עו"ד שרה מזרחי,10.04.2026',
    '9876-03-2025,אברהם מיכל,,01.01.2025',
    ',,,',
    '2222-07-2024,פרץ אבי,עו"ד מיכל כהן,20.07.2024',
  ].join('\n');
  await writeFile(csvPath, '﻿' + csvContent, 'utf-8'); // UTF-8 BOM

  // ── XLSX fixture: 2 sheets, 100 rows each ──────────────────────────────
  xlsxPath = join(TMP, 'test-legal.xlsx');
  const wb = XLSX.utils.book_new();
  const sheet1Data: string[][] = [
    ['מספר תיק', 'שם לקוח', 'ת.ז.', 'תאריך'],
    ...Array.from({ length: 100 }, (_, i) => [
      `${1000 + i}-05-2026`, `לקוח ${i}`, String(100000000 + i).padStart(9, '0'), `${(i % 28) + 1}.05.2026`,
    ]),
  ];
  const sheet2Data: string[][] = [
    ['תיק', 'ענין', 'עו"ד'],
    ...Array.from({ length: 50 }, (_, i) => [
      `ת"פ ${i + 1}`, `ענין ${i}`, `עו"ד כהן ${i}`,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), 'תיקים');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), 'פסיקה');
  XLSX.writeFile(wb, xlsxPath);
});

afterAll(async () => {
  await unlink(csvPath).catch(() => undefined);
  await unlink(xlsxPath).catch(() => undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ingestTabularFile — CSV', () => {
  it('parses Hebrew CSV and extracts case numbers', async () => {
    const result = await ingestTabularFile({
      filePath: csvPath, documents: mockDocs, processedFiles: mockPf,
    });
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rows.some((r) => r.caseNumber !== null)).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('extracts attorney names from rows', async () => {
    const result = await ingestTabularFile({
      filePath: csvPath, documents: mockDocs, processedFiles: mockPf,
    });
    const withAttorney = result.rows.filter((r) => r.attorney !== null);
    expect(withAttorney.length).toBeGreaterThan(0);
  });

  it('builds Case Scales sorted by row count', async () => {
    const result = await ingestTabularFile({
      filePath: csvPath, documents: mockDocs, processedFiles: mockPf,
    });
    expect(result.caseScales.length).toBeGreaterThan(0);
    // Scales should be sorted descending
    for (let i = 1; i < result.caseScales.length; i++) {
      expect(result.caseScales[i - 1]!.rowCount).toBeGreaterThanOrEqual(result.caseScales[i]!.rowCount);
    }
  });

  it('returns an EffortReport', async () => {
    const result = await ingestTabularFile({
      filePath: csvPath, documents: mockDocs, processedFiles: mockPf, ceilPercent: 95,
    });
    expect(result.effortReport).toBeDefined();
    expect(result.effortReport.ceilPercent).toBe(95);
    expect(result.effortReport.workUnits).toBeGreaterThanOrEqual(0);
  });
});

describe('ingestTabularFile — XLSX', () => {
  it('parses both sheets', async () => {
    const result = await ingestTabularFile({
      filePath: xlsxPath, documents: mockDocs, processedFiles: mockPf,
    });
    expect(result.sheetCount).toBe(2);
    expect(result.rowCount).toBeGreaterThan(100);
    expect(result.errors).toHaveLength(0);
  });

  it('extracts case numbers from sheet 1', async () => {
    const result = await ingestTabularFile({
      filePath: xlsxPath, documents: mockDocs, processedFiles: mockPf,
    });
    const caseRows = result.rows.filter((r) => r.caseNumber !== null);
    expect(caseRows.length).toBeGreaterThan(0);
  });

  it('cross-links via caseScales across sheets', async () => {
    const result = await ingestTabularFile({
      filePath: xlsxPath, documents: mockDocs, processedFiles: mockPf,
    });
    // Sheet2 has ת"פ patterns — should appear in scales
    const tpfScales = result.caseScales.filter((s) => s.caseNumber.startsWith('ת'));
    expect(tpfScales.length).toBeGreaterThan(0);
  });
});
