import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateTraceId, runWithTrace, currentTraceId } from './correlation.js';
import { obsLogger } from './logger.js';
import {
  MetricsStore,
  recordWorkflowStageDuration,
  incrementMemoryRejections,
  recordRetrievalCacheHit,
} from './metrics-store.js';

vi.mock('@factum-il/shared', () => ({
  logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  metrics: { addSink: vi.fn(), record: vi.fn() },
  clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
  roundConfidence: (v: number) => Math.round(v * 10000) / 10000,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Correlation', () => {
  it('generateTraceId() returns a non-empty UUID v4 string', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('currentTraceId() is undefined outside runWithTrace', () => {
    expect(currentTraceId()).toBeUndefined();
  });

  it('inside runWithTrace, currentTraceId() returns the given traceId', () => {
    let seen: string | undefined;
    runWithTrace('test-id', () => {
      seen = currentTraceId();
    });
    expect(seen).toBe('test-id');
  });

  it('after runWithTrace completes, currentTraceId() is undefined again', () => {
    runWithTrace('ephemeral', () => { /* noop */ });
    expect(currentTraceId()).toBeUndefined();
  });

  it('nested runWithTrace — inner sees inner id, outer sees outer id after inner completes', () => {
    let innerSeen: string | undefined;
    let outerAfterInner: string | undefined;
    runWithTrace('outer', () => {
      runWithTrace('inner', () => {
        innerSeen = currentTraceId();
      });
      outerAfterInner = currentTraceId();
    });
    expect(innerSeen).toBe('inner');
    expect(outerAfterInner).toBe('outer');
  });
});

describe('obsLogger', () => {
  it('obsLogger.info does not throw', () => {
    expect(() => obsLogger.info('hello', { caseId: 1 })).not.toThrow();
  });

  it('injects operationId from current trace context into shared logger call', async () => {
    const { logger } = await import('@factum-il/shared');
    runWithTrace('my-trace', () => {
      obsLogger.info('test message', { stage: 'test' });
    });
    expect(vi.mocked(logger.log)).toHaveBeenCalledWith(
      'INFO',
      'test message',
      expect.objectContaining({ operationId: 'my-trace' }),
    );
  });
});

describe('MetricsStore', () => {
  function makeMockDb() {
    const run = vi.fn();
    return { db: { prepare: () => ({ run }) }, run };
  }

  it('constructs without error given a mock db', () => {
    const { db } = makeMockDb();
    const store = new MetricsStore(db);
    store.stop();
  });

  it('sink() pushes metric to batch; stop() flushes to db', () => {
    const { db, run } = makeMockDb();
    const store = new MetricsStore(db);
    const sink = store.sink();
    sink({
      name: 'test_metric',
      value: 42,
      unit: 'ms',
      agent: 'test',
      recordedAt: new Date().toISOString(),
    });
    store.stop();
    expect(run).toHaveBeenCalledWith('test_metric', 42, 'ms', 'test', null, null);
  });

  it('stop() can be called twice without error', () => {
    const { db } = makeMockDb();
    const store = new MetricsStore(db);
    expect(() => { store.stop(); store.stop(); }).not.toThrow();
  });

  it('control-plane helpers do not throw', async () => {
    expect(() => recordWorkflowStageDuration('OCR_DONE', 1500)).not.toThrow();
    expect(() => incrementMemoryRejections()).not.toThrow();
    expect(() => recordRetrievalCacheHit(true)).not.toThrow();
  });
});
