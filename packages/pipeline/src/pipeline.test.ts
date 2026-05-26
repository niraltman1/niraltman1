import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { OCRService } from './ocr-service.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

const execMock    = vi.mocked(childProcess.execFileSync);
const existsMock  = vi.mocked(fs.existsSync);
const readdirMock = vi.mocked(fs.readdirSync);

describe('OCRService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReturnValue(false);
    readdirMock.mockReturnValue([]);
  });

  it('uses cache when DB returns a hit (no exec called)', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          ocr_text: 'תוכן משפטי שמור במטמון',
          confidence: 0.95,
          page_count: 2,
        }),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
    };

    const svc = new OCRService(mockDb as any);
    const result = await svc.run('/tmp/test.pdf', 'knownhash');

    expect(result.text).toBe('תוכן משפטי שמור במטמון');
    expect(result.fromCache).toBe(true);
    expect(execMock).not.toHaveBeenCalled();
  });

  it('returns empty text for PDF when all exec lanes fail gracefully and gs produces no pages', async () => {
    // ocrmypdf, pdftotext, docling all throw (caught internally)
    // gs succeeds but returns no pages (readdirSync returns [])
    execMock.mockImplementation((cmd: string) => {
      if (cmd === 'gs' || cmd === 'gswin64c') return Buffer.from('');
      throw new Error(`${cmd} not found`);
    });

    const svc = new OCRService(null);
    const result = await svc.run('/tmp/test.pdf', 'hash123');

    expect(result.text).toBe('');
    expect(result.fromCache).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns result with all required fields', async () => {
    // Use cache hit to avoid exec calls
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          ocr_text: 'test content',
          confidence: 0.8,
          page_count: 1,
        }),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
    };

    const svc = new OCRService(mockDb as any);
    const result = await svc.run('/tmp/doc.pdf', 'hashxyz');

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('pageCount');
    expect(result).toHaveProperty('fromCache');
    expect(result).toHaveProperty('durationMs');
    expect(typeof result.text).toBe('string');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.pageCount).toBe('number');
  });

  it('returns fromCache=false when DB has no match', async () => {
    // DB returns undefined (cache miss) — all PDF lanes unavailable, gs produces no pages
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        all: vi.fn().mockReturnValue([]),
        run: vi.fn(),
      }),
    };
    execMock.mockImplementation((cmd: string) => {
      if (cmd === 'gs' || cmd === 'gswin64c') return Buffer.from('');
      throw new Error(`${cmd} not found`);
    });

    const svc = new OCRService(mockDb as any);
    const result = await svc.run('/tmp/doc.pdf', 'newhash');

    expect(result.fromCache).toBe(false);
  });
});
