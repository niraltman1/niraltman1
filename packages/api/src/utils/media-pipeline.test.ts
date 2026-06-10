import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessedFile } from '@factum-il/database';

// `extractPdfText` (internal to media-pipeline) shells out to pdftotext via execFile.
// Mock it to simulate a scanned/image-based PDF that yields no text layer.
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

// `runOCRInWorker` is the worker-thread OCR fallback (Tesseract via OCRService).
// Mock the whole package export so we control its result without spinning up a real worker.
const runOCRInWorkerMock = vi.fn();
vi.mock('@factum-il/pipeline', () => ({
  runOCRInWorker: (...args: unknown[]) => runOCRInWorkerMock(...args),
}));

import { MediaPipeline } from './media-pipeline.js';

interface FakeProcessedFiles {
  findByHash: ReturnType<typeof vi.fn>;
  register:   ReturnType<typeof vi.fn>;
  updateStatus: ReturnType<typeof vi.fn>;
  updatePath: ReturnType<typeof vi.fn>;
  deleteByHash: ReturnType<typeof vi.fn>;
}

interface FakeDocuments {
  findByHash: ReturnType<typeof vi.fn>;
  create:     ReturnType<typeof vi.fn>;
}

interface FakePipelineLogs {
  create: ReturnType<typeof vi.fn>;
}

function makeFakeRepos(): { processedFiles: FakeProcessedFiles; documents: FakeDocuments; pipelineLogs: FakePipelineLogs } {
  const processedFiles: FakeProcessedFiles = {
    findByHash:   vi.fn().mockReturnValue(null),
    register:     vi.fn().mockReturnValue({ id: 1 } as unknown as ProcessedFile),
    updateStatus: vi.fn(),
    updatePath:   vi.fn(),
    deleteByHash: vi.fn(),
  };
  const documents: FakeDocuments = {
    findByHash: vi.fn().mockReturnValue(null),
    create:     vi.fn().mockReturnValue({ id: 42 }),
  };
  const pipelineLogs: FakePipelineLogs = { create: vi.fn() };
  return { processedFiles, documents, pipelineLogs };
}

/** Stub `execFile` so `extractPdfText` resolves with empty stdout (no text layer). */
function stubEmptyPdfTextExtraction(): void {
  execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
    cb(null, '');
  });
}

describe('MediaPipeline — OCR fallback for scanned/image-based PDFs', () => {
  let dir: string;
  let pdfPath: string;

  beforeEach(async () => {
    // NOTE: deliberately not using os.tmpdir() — MediaPipeline's Data Firewall
    // excludes any path containing a `/tmp/` segment (see EXCLUDED_PATTERNS).
    dir = await mkdtemp(join(process.cwd(), '.media-pipeline-fixture-'));
    pdfPath = join(dir, 'scanned.pdf');
    await writeFile(pdfPath, Buffer.from('%PDF-1.4 fake scanned content'));
    execFileMock.mockReset();
    runOCRInWorkerMock.mockReset();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('falls back to runOCRInWorker when pdftotext yields no text, and registers the OCR text', async () => {
    stubEmptyPdfTextExtraction();
    runOCRInWorkerMock.mockResolvedValue({
      text: 'טקסט שחולץ באמצעות OCR מסמך סרוק', confidence: 0.87, pageCount: 1, fromCache: false, durationMs: 500,
    });

    const { processedFiles, documents, pipelineLogs } = makeFakeRepos();
    const pipeline = new MediaPipeline(
      processedFiles as unknown as never, documents as unknown as never, undefined, undefined, undefined,
      pipelineLogs as unknown as never, undefined,
    );

    const result = await pipeline.ingest({ filePath: pdfPath });

    expect(runOCRInWorkerMock).toHaveBeenCalledTimes(1);
    expect(runOCRInWorkerMock.mock.calls[0]![0]).toMatchObject({ filePath: pdfPath, dbPath: null });

    expect(result.status).toBe('registered');
    expect(documents.create).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'application/pdf',
    }));

    // Logged as a successful OCR pass (via the fallback), not a failure.
    expect(pipelineLogs.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ocr_success',
      errorMessage: expect.stringContaining('נפילה חזרה ל-OCR'),
    }));
    expect(pipelineLogs.create).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed_ocr' }));
  });

  it('logs failed_ocr when the OCR fallback also yields no text', async () => {
    stubEmptyPdfTextExtraction();
    runOCRInWorkerMock.mockResolvedValue({
      text: '', confidence: 0, pageCount: 1, fromCache: false, durationMs: 100,
    });

    const { processedFiles, documents, pipelineLogs } = makeFakeRepos();
    const pipeline = new MediaPipeline(
      processedFiles as unknown as never, documents as unknown as never, undefined, undefined, undefined,
      pipelineLogs as unknown as never, undefined,
    );

    await pipeline.ingest({ filePath: pdfPath });

    expect(runOCRInWorkerMock).toHaveBeenCalledTimes(1);
    expect(pipelineLogs.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed_ocr',
      errorMessage: expect.stringContaining('גם נפילה חזרה ל-OCR לא הניבה טקסט'),
    }));
  });

  it('logs failed_ocr (without crashing the ingest) when the OCR fallback throws', async () => {
    stubEmptyPdfTextExtraction();
    runOCRInWorkerMock.mockRejectedValue(new Error('Tesseract not found'));

    const { processedFiles, documents, pipelineLogs } = makeFakeRepos();
    const pipeline = new MediaPipeline(
      processedFiles as unknown as never, documents as unknown as never, undefined, undefined, undefined,
      pipelineLogs as unknown as never, undefined,
    );

    const result = await pipeline.ingest({ filePath: pdfPath });

    expect(result.status).toBe('registered');
    expect(pipelineLogs.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed_ocr',
      errorMessage: expect.stringContaining('נפילה חזרה ל-OCR נכשלה'),
    }));
  });

  it('does not invoke the OCR fallback when pdftotext already extracted text', async () => {
    execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
      cb(null, 'טקסט רגיל שחולץ ישירות מה-PDF');
    });

    const { processedFiles, documents, pipelineLogs } = makeFakeRepos();
    const pipeline = new MediaPipeline(
      processedFiles as unknown as never, documents as unknown as never, undefined, undefined, undefined,
      pipelineLogs as unknown as never, undefined,
    );

    await pipeline.ingest({ filePath: pdfPath });

    expect(runOCRInWorkerMock).not.toHaveBeenCalled();
    expect(pipelineLogs.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'ocr_success' }));
    expect(pipelineLogs.create).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'failed_ocr' }));
  });
});
