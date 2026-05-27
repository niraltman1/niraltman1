import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockWorker {
  on(event: string, handler: (...args: unknown[]) => void): void;
  terminate(): Promise<number>;
  _emit(event: string, ...args: unknown[]): void;
}

const createdWorkers: MockWorker[] = [];

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn().mockImplementation((_url: unknown, _opts: unknown) => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const w: MockWorker = {
      on(event, handler) { handlers.set(event, handler); },
      terminate: vi.fn().mockResolvedValue(1),
      _emit(event, ...args) { handlers.get(event)?.(...args); },
    };
    createdWorkers.push(w);
    return w;
  }),
}));

import { runOCRInWorker } from '../ocr-runner.js';
import type { OCRResult } from '../ocr-service.js';

const GOOD_RESULT: OCRResult = {
  text:       'טקסט משפטי לדוגמה',
  confidence: 0.92,
  pageCount:  2,
  fromCache:  false,
  durationMs: 1234,
};

describe('runOCRInWorker', () => {
  beforeEach(() => {
    createdWorkers.length = 0;
    vi.clearAllMocks();
  });

  it('resolves with OCRResult when worker posts ok=true', async () => {
    const promise = runOCRInWorker({ filePath: '/tmp/a.pdf', fileHash: 'abc', dbPath: null });
    const worker = createdWorkers[0]!;
    worker._emit('message', { ok: true, result: GOOD_RESULT });
    const result = await promise;
    expect(result).toEqual(GOOD_RESULT);
  });

  it('rejects when worker posts ok=false', async () => {
    const promise = runOCRInWorker({ filePath: '/tmp/a.pdf', fileHash: 'abc', dbPath: null });
    createdWorkers[0]!._emit('message', { ok: false, error: 'Tesseract not found' });
    await expect(promise).rejects.toThrow('Tesseract not found');
  });

  it('rejects on worker error event', async () => {
    const promise = runOCRInWorker({ filePath: '/tmp/a.pdf', fileHash: 'abc', dbPath: null });
    createdWorkers[0]!._emit('error', new Error('worker crashed'));
    await expect(promise).rejects.toThrow('worker crashed');
  });

  it('rejects and terminates worker after timeout', async () => {
    vi.useFakeTimers();

    const promise = runOCRInWorker({
      filePath:  '/tmp/a.pdf',
      fileHash:  'abc',
      dbPath:    null,
      timeoutMs: 5_000,
    });

    // Attach the rejection handler BEFORE advancing time so the rejection is
    // never unhandled even momentarily.
    const assertion = expect(promise).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;

    expect(createdWorkers[0]!.terminate).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('second message or error after settle is ignored (no double-reject)', async () => {
    const promise = runOCRInWorker({ filePath: '/tmp/a.pdf', fileHash: 'abc', dbPath: null });
    const w = createdWorkers[0]!;
    w._emit('message', { ok: true, result: GOOD_RESULT });
    w._emit('error', new Error('too late'));
    await expect(promise).resolves.toEqual(GOOD_RESULT);
  });
});
