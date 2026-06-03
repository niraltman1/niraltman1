/**
 * File-ingestion controller (Vacuum Protocol).
 *
 * Owns the live FileWatcher over the configured folders and the durable queue processor.
 * The watcher records detected files into WatcherEvents (processed = 0); the processor drains
 * them into the media pipeline. Folder configuration is held by ConfigStore (survives restart)
 * and can be reconfigured at runtime without restarting the process.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { FileWatcher } from '@factum-il/pipeline';
import type { Repos } from '../db.js';
import { logger } from '@factum-il/shared';
import {
  startWatcherProcessor, stopWatcherProcessor, type IngestLike,
} from './watcher-event-processor.js';

// Mirrors FileWatcher's accepted extensions (keep in sync).
const SUPPORTED_EXT = new Set(['.pdf', '.docx', '.doc', '.odt', '.tiff', '.tif', '.png', '.jpg', '.jpeg']);

let _watcher:  FileWatcher | null = null;
let _repos:    Repos | null = null;

/** Start watching the given folders and drain the queue into the pipeline. */
export function startFileIngestion(repos: Repos, pipeline: IngestLike, folders: string[]): void {
  _repos = repos;
  attachWatcher(repos, folders);
  startWatcherProcessor(repos.watcherEvents, pipeline);
}

export function stopFileIngestion(): void {
  _watcher?.stop();
  _watcher = null;
  stopWatcherProcessor();
}

/** Swap the watched folders at runtime (processor keeps running). */
export function reconfigureWatchFolders(folders: string[]): void {
  if (!_repos) return;
  attachWatcher(_repos, folders);
}

function attachWatcher(repos: Repos, folders: string[]): void {
  _watcher?.stop();
  if (folders.length === 0) { _watcher = null; return; }
  const w = new FileWatcher(repos.db);
  w.on('error', (err: unknown) => logger.warn(`[file-ingestion] watcher error: ${err instanceof Error ? err.message : String(err)}`));
  for (const folder of folders) {
    try { w.watch(folder); }
    catch (e) { logger.warn(`[file-ingestion] cannot watch ${folder}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  _watcher = w;
  logger.info(`[file-ingestion] watching ${folders.length} folder(s)`);
}

/**
 * Enqueue every supported file already present under a folder (recursive), so the processor
 * ingests a directory that existed before watching began. Returns how many were enqueued.
 */
export function rescanFolder(repos: Repos, folder: string): number {
  let count = 0;
  const root = resolve(folder);
  const walk = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (!SUPPORTED_EXT.has(extname(full).toLowerCase())) continue;
      repos.watcherEvents.enqueue(full);
      count++;
    }
  };
  walk(root);
  logger.info(`[file-ingestion] rescan of ${root} enqueued ${count} file(s)`);
  return count;
}
