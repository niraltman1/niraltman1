// Lightweight in-process async mutex for serializing background scheduler writes.
// HTTP routes do NOT acquire this — only background timers (rag, retention, backup, nudge, content-update).
// Prevents two schedulers from doing bulk SQLite writes simultaneously.

import { logger } from '@legal-os/shared';

let locked = false;
const queue: Array<{ resolve: () => void; label: string }> = [];

export async function withWriteLock<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  await new Promise<void>((resolve) => {
    if (!locked) {
      locked = true;
      resolve();
    } else {
      queue.push({ resolve, label });
    }
  });

  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    if (durationMs > 5000) {
      logger.warn(`[WriteMutex] ${label} held lock for ${durationMs}ms`, { category: 'system' });
    }
    const next = queue.shift();
    if (next) {
      // Lock stays held; next acquirer resumes synchronously
      next.resolve();
    } else {
      locked = false;
    }
  }
}

export function writeLockStatus(): { locked: boolean; queueDepth: number; queued: string[] } {
  return { locked, queueDepth: queue.length, queued: queue.map((q) => q.label) };
}
