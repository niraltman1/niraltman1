import type { DatabaseConnection } from '@factum-il/database';
import { FileWatcher } from '../file-watcher.js';
import type { IngestAdapter, IngestAdapterConfig } from './ingest-adapter.js';
import https from 'node:https';
import http from 'node:http';

export class FileSystemAdapter implements IngestAdapter {
  private watcher: FileWatcher | null = null;

  constructor(private readonly db: DatabaseConnection) {}

  watch(config: IngestAdapterConfig): void {
    if (this.watcher) return;
    this.watcher = new FileWatcher(this.db);

    this.watcher.on('file:added', (evt: { filePath: string }) => {
      void this.postToApi(config.apiBase, evt.filePath);
    });

    for (const folder of config.watchFolders) {
      this.watcher.watch(folder);
    }
  }

  stop(): void {
    this.watcher?.stop();
    this.watcher = null;
  }

  private postToApi(apiBase: string, filePath: string): Promise<void> {
    return new Promise((resolve) => {
      const url    = new URL('/api/media/ingest', apiBase);
      const body   = JSON.stringify({ filePath });
      const lib    = url.protocol === 'https:' ? https : http;
      const req    = lib.request(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      });
      req.on('response', (res) => { res.resume(); resolve(); });
      req.on('error',    () => resolve());
      req.write(body);
      req.end();
    });
  }
}
