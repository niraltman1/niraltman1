import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseConnection, WatcherEventsRepository } from '@factum-il/database';
import { processWatcherQueueOnce, _resetAttempts, type IngestLike } from './watcher-event-processor.js';

const SCHEMA = `
CREATE TABLE WatcherEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL DEFAULT 'added',
  file_path TEXT NOT NULL, file_hash TEXT, debounce_key TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0, queued INTEGER NOT NULL DEFAULT 0,
  duplicate INTEGER NOT NULL DEFAULT 0, error_message TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')), processed_at TEXT
);`;

/** Pipeline stub: returns a fixed status, or throws when status === 'throw'. */
function stubPipeline(status: string): IngestLike {
  return {
    ingest: async ({ filePath }) => {
      if (status === 'throw') throw new Error('boom');
      return { status, documentId: status === 'registered' ? 1 : null, message: `m:${filePath}` };
    },
  };
}

describe('processWatcherQueueOnce (file-ingestion drain)', () => {
  let db: DatabaseConnection;
  let repo: WatcherEventsRepository;
  let dir: string;

  beforeEach(() => {
    db = new DatabaseConnection({ path: ':memory:' });
    db.exec(SCHEMA);
    repo = new WatcherEventsRepository(db);
    dir = mkdtempSync(join(tmpdir(), 'fi-test-'));
    _resetAttempts();
  });

  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  function realFile(name: string): string {
    const p = join(dir, name);
    writeFileSync(p, 'x');
    return p;
  }

  it('ingests a registered file → processed + queued', async () => {
    repo.enqueue(realFile('a.pdf'));
    const r = await processWatcherQueueOnce(repo, stubPipeline('registered'));
    expect(r.ingested).toBe(1);
    expect(repo.listUnprocessed()).toHaveLength(0);
    expect(repo.recent(1)[0]!.queued).toBe(true);
  });

  it('marks an already_registered file as a duplicate (processed, not queued)', async () => {
    repo.enqueue(realFile('b.pdf'));
    const r = await processWatcherQueueOnce(repo, stubPipeline('already_registered'));
    expect(r.duplicates).toBe(1);
    expect(repo.recent(1)[0]!.duplicate).toBe(true);
  });

  it('closes an excluded file with its message (terminal)', async () => {
    repo.enqueue(realFile('c.pdf'));
    const r = await processWatcherQueueOnce(repo, stubPipeline('excluded'));
    expect(r.excluded).toBe(1);
    const row = repo.recent(1)[0]!;
    expect(row.processed).toBe(true);
    expect(row.errorMessage).toContain('m:');
  });

  it('gives up on a vanished file immediately', async () => {
    repo.enqueue(join(dir, 'ghost.pdf')); // never created
    const r = await processWatcherQueueOnce(repo, stubPipeline('registered'));
    expect(r.givenUp).toBe(1);
    expect(repo.recent(1)[0]!.errorMessage).toContain('אינו קיים');
  });

  it('retries a failing file then gives up after the attempt cap', async () => {
    const e = repo.enqueue(realFile('d.pdf'));
    // Default MAX_ATTEMPTS = 3 → first two ticks retry, third closes the row.
    let last = await processWatcherQueueOnce(repo, stubPipeline('failed'));
    expect(last.failed).toBe(1);
    expect(repo.get(e.id)!.processed).toBe(false);

    last = await processWatcherQueueOnce(repo, stubPipeline('failed'));
    expect(last.failed).toBe(1);

    last = await processWatcherQueueOnce(repo, stubPipeline('failed'));
    expect(last.givenUp).toBe(1);
    const row = repo.get(e.id)!;
    expect(row.processed).toBe(true);
    expect(row.errorMessage).toContain('נכשל לאחר');
  });

  it('treats a thrown pipeline error as a retryable failure', async () => {
    const e = repo.enqueue(realFile('e.pdf'));
    const r = await processWatcherQueueOnce(repo, stubPipeline('throw'));
    expect(r.failed).toBe(1);
    expect(repo.get(e.id)!.processed).toBe(false);
    expect(repo.get(e.id)!.errorMessage).toBe('boom');
  });
});
