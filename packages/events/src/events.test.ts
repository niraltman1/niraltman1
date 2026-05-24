import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error -- resolved via vitest alias to ../database/node_modules/better-sqlite3
import Database from 'better-sqlite3';
import { EventBus, createEventBus } from './bus.js';
import { EventStore } from './store.js';

type RawDb = {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): void; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
};

function createTestDb(): RawDb {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return new (Database as new (path: string) => RawDb)(':memory:') as RawDb;
}

function setupSchema(db: RawDb) {
  db.exec(`
    CREATE TABLE EventStore (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id    TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE EventHandlerLog (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id   TEXT NOT NULL,
      handler_id TEXT NOT NULL,
      UNIQUE(trace_id, handler_id)
    );
    CREATE TABLE DeadLetterQueue (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id       TEXT NOT NULL,
      kind           TEXT NOT NULL,
      payload        TEXT NOT NULL,
      failure_reason TEXT NOT NULL
    );
  `);
  return db;
}

// cast RawDb → the duck-typed DbHandle EventStore expects
function makeStore(db: RawDb) {
  return new EventStore(db as unknown as ConstructorParameters<typeof EventStore>[0]);
}

const OCR_EVENT = { kind: 'OCRCompleted' as const, documentId: 1, caseId: null as null, ocrTextLength: 100 };

describe('EventBus (no store)', () => {
  it('calls handler with published event', async () => {
    const bus = createEventBus(null);
    const handler = vi.fn();
    bus.subscribe('OCRCompleted', 'h1', handler);
    await bus.publish({ ...OCR_EVENT });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0]).toMatchObject({ kind: 'OCRCompleted', documentId: 1 });
  });

  it('auto-generates traceId when not provided', async () => {
    const bus = createEventBus(null);
    const calls: unknown[] = [];
    bus.subscribe('OCRCompleted', 'h1', e => { calls.push(e); });
    await bus.publish({ ...OCR_EVENT });
    expect(typeof (calls[0] as { traceId: string }).traceId).toBe('string');
  });

  it('uses provided traceId', async () => {
    const bus = createEventBus(null);
    const calls: unknown[] = [];
    bus.subscribe('OCRCompleted', 'h1', e => { calls.push(e); });
    await bus.publish({ ...OCR_EVENT, traceId: 'my-trace' });
    expect((calls[0] as { traceId: string }).traceId).toBe('my-trace');
  });

  it('does not call handler for different event kind', async () => {
    const bus = createEventBus(null);
    const handler = vi.fn();
    bus.subscribe('EntitiesExtracted', 'h1', handler);
    await bus.publish({ ...OCR_EVENT });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('EventBus with EventStore — idempotency', () => {
  it('does not call handler twice for same traceId + handlerId', async () => {
    const db = setupSchema(createTestDb());
    const bus = new EventBus(makeStore(db));
    const handler = vi.fn();
    bus.subscribe('OCRCompleted', 'h1', handler);
    await bus.publish({ ...OCR_EVENT, traceId: 'tr-1' });
    await bus.publish({ ...OCR_EVENT, traceId: 'tr-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('appends event to EventStore on publish', async () => {
    const db = setupSchema(createTestDb());
    const bus = new EventBus(makeStore(db));
    await bus.publish({ ...OCR_EVENT, documentId: 2, traceId: 'tr-2' });
    const row = db.prepare("SELECT kind FROM EventStore WHERE trace_id='tr-2'").get() as { kind: string } | undefined;
    expect(row?.kind).toBe('OCRCompleted');
  });
});

describe('EventBus with EventStore — dead-letter queue', () => {
  it('moves event to DeadLetterQueue after 3 failed attempts', async () => {
    const db = setupSchema(createTestDb());
    const bus = new EventBus(makeStore(db));
    bus.subscribe('OCRCompleted', 'h1', () => { throw new Error('boom'); });
    await bus.publish({ ...OCR_EVENT, documentId: 3, traceId: 'tr-3' });
    const dlq = db.prepare("SELECT failure_reason FROM DeadLetterQueue WHERE trace_id='tr-3'").get() as { failure_reason: string } | undefined;
    expect(dlq?.failure_reason).toContain('boom');
  });
});

describe('EventStore.queryByKind', () => {
  it('returns events filtered by kind', async () => {
    const db = setupSchema(createTestDb());
    const store = makeStore(db);
    const bus = new EventBus(store);
    await bus.publish({ ...OCR_EVENT, documentId: 1, traceId: 'a' });
    await bus.publish({ ...OCR_EVENT, documentId: 2, traceId: 'b' });
    await bus.publish({ kind: 'EntitiesExtracted', documentId: 1, caseId: null, traceId: 'c' });
    const results = store.queryByKind('OCRCompleted');
    expect(results).toHaveLength(2);
    expect(results.every(e => e.kind === 'OCRCompleted')).toBe(true);
  });
});
