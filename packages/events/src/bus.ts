import { randomUUID } from 'node:crypto';
import type { DomainEvent, EventKind, EventOfKind } from './types.js';
import type { EventStore } from './store.js';

type Handler<K extends EventKind> = (event: EventOfKind<K>) => Promise<void> | void;

// Distributive Omit: preserves discriminated union so callers can write { kind: 'OCRCompleted', ... }
export type PublishInput = {
  [K in EventKind]: Omit<EventOfKind<K>, 'traceId' | 'occurredAt'>;
}[EventKind] & { traceId?: string };

const MAX_ATTEMPTS = 3;

export class EventBus {
  private readonly handlers = new Map<EventKind, Array<{ id: string; fn: Handler<EventKind> }>>();

  constructor(private readonly store: EventStore | null = null) {}

  subscribe<K extends EventKind>(kind: K, handlerId: string, handler: Handler<K>): void {
    const existing = this.handlers.get(kind) ?? [];
    existing.push({ id: handlerId, fn: handler as unknown as Handler<EventKind> });
    this.handlers.set(kind, existing);
  }

  async publish(kindAndPayload: PublishInput): Promise<void> {
    const traceId = kindAndPayload.traceId ?? randomUUID();
    const occurredAt = new Date().toISOString();

    const event: DomainEvent = { ...kindAndPayload, traceId, occurredAt } as DomainEvent;

    this.store?.append(event);

    const kindHandlers = this.handlers.get(event.kind) ?? [];

    await Promise.allSettled(
      kindHandlers.map(async ({ id: handlerId, fn }) => {
        if (this.store?.wasHandled(traceId, handlerId)) {
          return;
        }

        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            await fn(event as EventOfKind<EventKind>);
            this.store?.markHandled(traceId, handlerId);
            return;
          } catch (err) {
            lastError = err;
          }
        }

        // All attempts exhausted — move to dead-letter queue
        const reason = lastError instanceof Error ? lastError.message : String(lastError);
        this.store?.moveToDead(traceId, event.kind, JSON.stringify(event), reason);
      })
    );
  }

  async replay(kind: EventKind, since?: string): Promise<void> {
    if (this.store === null) {
      return;
    }

    const events = this.store.queryByKind(kind, since);

    for (const event of events) {
      // Re-publish; existing handlers skip already-handled events via idempotency check
      await this.publish(event as unknown as PublishInput);
    }
  }
}

export function createEventBus(store: EventStore | null = null): EventBus {
  return new EventBus(store);
}
