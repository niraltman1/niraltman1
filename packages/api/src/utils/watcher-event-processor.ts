/**
 * Watcher event processor (Vacuum Protocol — file ingestion).
 *
 * Drains the durable WatcherEvents queue: the FileWatcher records every stable file it
 * detects (processed = 0); this background loop calls the media pipeline for each and marks
 * the row processed. Because the queue lives in SQLite, detection survives a crash and is
 * retried. Transient failures stay unprocessed (retried next tick) up to MAX_ATTEMPTS, after
 * which the row is closed with its error so a permanently-bad file never hot-loops.
 */

import { existsSync } from 'node:fs';
import type { WatcherEventsRepository } from '@factum-il/database';
import { logger } from '@factum-il/shared';

/** Minimal pipeline contract — keeps this loop unit-testable without the full MediaPipeline. */
export interface IngestLike {
  ingest(opts: { filePath: string }): Promise<{ status: string; documentId: number | null; message: string }>;
}

export interface TickResult {
  scanned:    number;
  ingested:   number;
  duplicates: number;
  excluded:   number;
  failed:     number;   // left for retry this tick
  givenUp:    number;   // closed after exhausting retries
}

const INTERVAL_MS   = Number(process.env['WATCHER_PROCESS_INTERVAL_MS'] ?? 5_000);
const BATCH_SIZE    = Number(process.env['WATCHER_PROCESS_BATCH'] ?? 25);
const MAX_ATTEMPTS  = Number(process.env['WATCHER_PROCESS_MAX_ATTEMPTS'] ?? 3);

// In-memory retry counter (resets on restart — acceptable; the row is retried again after reboot).
const attempts = new Map<number, number>();

/**
 * Drain one batch. Pure-ish and injectable: pass the events repo + a pipeline-like object.
 * Returns per-tick counts (used by tests and observability).
 */
export async function processWatcherQueueOnce(
  events:   WatcherEventsRepository,
  pipeline: IngestLike,
  batchSize = BATCH_SIZE,
): Promise<TickResult> {
  const result: TickResult = { scanned: 0, ingested: 0, duplicates: 0, excluded: 0, failed: 0, givenUp: 0 };
  const batch = events.listUnprocessed(batchSize);

  for (const evt of batch) {
    result.scanned++;

    if (!existsSync(evt.filePath)) {
      events.markProcessed(evt.id, { error: 'הקובץ אינו קיים עוד' });
      attempts.delete(evt.id);
      result.givenUp++;
      continue;
    }

    try {
      const r = await pipeline.ingest({ filePath: evt.filePath });
      switch (r.status) {
        case 'already_registered':
          events.markProcessed(evt.id, { duplicate: true });
          result.duplicates++;
          break;
        case 'excluded':
          events.markProcessed(evt.id, { error: r.message });
          result.excluded++;
          break;
        case 'failed':
          registerFailure(events, evt.id, r.message, result);
          break;
        default: // registered / converted_to_pdf / path_updated
          events.markProcessed(evt.id, { queued: true });
          result.ingested++;
          break;
      }
      if (r.status !== 'failed') attempts.delete(evt.id);
    } catch (e) {
      registerFailure(events, evt.id, e instanceof Error ? e.message : String(e), result);
    }
  }

  return result;
}

function registerFailure(
  events: WatcherEventsRepository,
  id: number,
  message: string,
  result: TickResult,
): void {
  const n = (attempts.get(id) ?? 0) + 1;
  attempts.set(id, n);
  if (n >= MAX_ATTEMPTS) {
    events.markProcessed(id, { error: `נכשל לאחר ${n} ניסיונות: ${message}` });
    attempts.delete(id);
    result.givenUp++;
  } else {
    events.recordRetryableError(id, message);
    result.failed++;
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;

/** Start the periodic drain loop (no-op if already running). */
export function startWatcherProcessor(events: WatcherEventsRepository, pipeline: IngestLike): void {
  if (_timer) return;
  const tick = async () => {
    if (_running) return;            // never overlap ticks
    _running = true;
    try {
      const r = await processWatcherQueueOnce(events, pipeline);
      if (r.ingested || r.duplicates || r.givenUp) {
        logger.info(`[file-ingestion] +${r.ingested} ingested, ${r.duplicates} dup, ${r.excluded} excluded, ${r.failed} retry, ${r.givenUp} gave-up`);
      }
    } catch (e) {
      logger.warn(`[file-ingestion] processor tick failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      _running = false;
    }
  };
  _timer = setInterval(() => void tick(), INTERVAL_MS);
  logger.info(`[file-ingestion] watcher processor started (every ${INTERVAL_MS}ms)`);
}

export function stopWatcherProcessor(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

/** Test seam: clear the in-memory retry counters. */
export function _resetAttempts(): void { attempts.clear(); }
