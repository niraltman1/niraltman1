import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OCRPreprocessor } from '../../packages/pipeline/src/ocr-preprocessor.js';

// Mock child_process.execFile so tests run without Ghostscript/ImageMagick installed
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_bin: string, _args: string[], cb: Function) => cb(null, { stdout: '', stderr: '' })),
}));
vi.mock('node:util', () => ({
  promisify: (fn: Function) => (...args: unknown[]) =>
    new Promise((resolve, reject) =>
      fn(...args, (err: Error | null, result: unknown) => err ? reject(err) : resolve(result))
    ),
}));

describe('OCRPreprocessor — unit (mocked binaries)', () => {
  let preprocessor: OCRPreprocessor;

  beforeEach(() => {
    preprocessor = new OCRPreprocessor();
    vi.clearAllMocks();
  });

  it('is instantiable', () => {
    expect(preprocessor).toBeInstanceOf(OCRPreprocessor);
  });

  it('binarize resolves without throwing', async () => {
    await expect(preprocessor.binarize('/tmp/in.png', '/tmp/out.png')).resolves.toBeUndefined();
  });

  it('denoise resolves without throwing', async () => {
    await expect(preprocessor.denoise('/tmp/in.png', '/tmp/out.png')).resolves.toBeUndefined();
  });

  it('normalizeContrast resolves without throwing', async () => {
    await expect(preprocessor.normalizeContrast('/tmp/in.png', '/tmp/out.png')).resolves.toBeUndefined();
  });

  it('normalizeDPI resolves without throwing', async () => {
    await expect(preprocessor.normalizeDPI('/tmp/in.pdf', '/tmp/out.png', 300)).resolves.toBeUndefined();
  });

  it('deskew returns angle 0 when no match in stderr', async () => {
    const result = await preprocessor.deskew('/tmp/in.png', '/tmp/out');
    expect(result.angle).toBe(0);
    expect(typeof result.outputPath).toBe('string');
  });
});

describe('OCRPreprocessor.assessQuality', () => {
  it('returns safe defaults on error', async () => {
    const preprocessor = new OCRPreprocessor();
    // assessQuality calls execFile internally — with mock it returns empty stdout
    const quality = await preprocessor.assessQuality('/tmp/nonexistent.png');
    // Should not throw; returns defaults
    expect(typeof quality.meanSignalStrength).toBe('number');
    expect(typeof quality.estimatedDPI).toBe('number');
    expect(typeof quality.isMonochrome).toBe('boolean');
  });
});
