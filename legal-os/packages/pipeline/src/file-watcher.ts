import { EventEmitter } from 'node:events';
import { watch, statSync, openSync, closeSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { FSWatcher } from 'node:fs';
import type { DatabaseConnection } from '@factum-il/database';

export interface WatcherOptions {
  debounceMs?:        number;   // default 800
  minFileSizeBytes?:  number;   // default 1024
  recursive?:         boolean;  // default true
  stabilityCheckMs?:  number;   // how long to wait to confirm size stable (default 300)
}

export interface WatcherEvent {
  type:        'added' | 'changed';
  filePath:    string;
  occurredAt:  Date;
}

const SUPPORTED_EXT = new Set(['.pdf', '.docx', '.doc', '.odt', '.tiff', '.tif', '.png', '.jpg', '.jpeg']);

export class FileWatcher extends EventEmitter {
  private readonly db:        DatabaseConnection;
  private readonly opts:      Required<WatcherOptions>;
  private readonly watchers:  Map<string, FSWatcher> = new Map();
  private readonly debounce:  Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(db: DatabaseConnection, opts: WatcherOptions = {}) {
    super();
    this.db   = db;
    this.opts = {
      debounceMs:        opts.debounceMs        ?? 800,
      minFileSizeBytes:  opts.minFileSizeBytes  ?? 1024,
      recursive:         opts.recursive         ?? true,
      stabilityCheckMs:  opts.stabilityCheckMs  ?? 300,
    };
  }

  // ───────────────────────────────────────────────
  //  Public API
  // ───────────────────────────────────────────────

  watch(directory: string): void {
    const absDir = resolve(directory);
    if (this.watchers.has(absDir)) return;

    const watcher = watch(absDir, { recursive: this.opts.recursive }, (_event, filename) => {
      if (!filename) return;
      const filePath = resolve(absDir, filename);
      const ext      = extname(filePath).toLowerCase();
      if (!SUPPORTED_EXT.has(ext)) return;
      this.scheduleCheck(filePath);
    });

    watcher.on('error', (err) => this.emit('error', err));
    this.watchers.set(absDir, watcher);
    this.emit('watching', { directory: absDir });
  }

  stop(directory?: string): void {
    const targets = directory ? [resolve(directory)] : [...this.watchers.keys()];
    for (const dir of targets) {
      this.watchers.get(dir)?.close();
      this.watchers.delete(dir);
    }
    for (const timer of this.debounce.values()) clearTimeout(timer);
    this.debounce.clear();
    this.emit('stopped');
  }

  // ───────────────────────────────────────────────
  //  Debounce + stability
  // ───────────────────────────────────────────────

  private scheduleCheck(filePath: string): void {
    const existing = this.debounce.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounce.delete(filePath);
      void this.processFile(filePath);
    }, this.opts.debounceMs);

    this.debounce.set(filePath, timer);
  }

  private async processFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) return;

    try {
      const stat = statSync(filePath);
      if (stat.size < this.opts.minFileSizeBytes) return;

      if (!(await this.isStable(filePath))) return;

      const event: WatcherEvent = { type: 'added', filePath, occurredAt: new Date() };
      this.logEvent(event);
      this.emit('file:added', event);
    } catch {
      // File may have been deleted between detection and processing — ignore
    }
  }

  private async isStable(filePath: string): Promise<boolean> {
    try {
      const size1 = statSync(filePath).size;
      await new Promise((r) => setTimeout(r, this.opts.stabilityCheckMs));
      if (!existsSync(filePath)) return false;
      const size2 = statSync(filePath).size;
      if (size1 !== size2) return false;

      // Attempt exclusive open (confirms no writer holds a lock)
      const fd = openSync(filePath, 'r');
      closeSync(fd);
      return true;
    } catch {
      return false;
    }
  }

  private logEvent(evt: WatcherEvent): void {
    try {
      this.db.prepare(`
        INSERT INTO WatcherEvents (event_type, file_path, debounce_key)
        VALUES (?, ?, ?)
      `).run(evt.type, evt.filePath, evt.filePath);
    } catch { /* non-fatal */ }
  }
}
