import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const store = new AsyncLocalStorage<string>();

export function generateTraceId(): string {
  return randomUUID();
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return store.run(traceId, fn);
}

export function currentTraceId(): string | undefined {
  return store.getStore();
}
