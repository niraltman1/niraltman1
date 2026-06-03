import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigStore } from './config-store.js';

describe('ConfigStore — watch folders (file ingestion)', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cfg-test-')); dbPath = join(dir, 'factum.sqlite'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to no watched folders', () => {
    expect(new ConfigStore(dbPath).getWatchFolders()).toEqual([]);
  });

  it('normalizes folders: trims, drops blanks, de-duplicates (order preserved)', () => {
    const cfg = new ConfigStore(dbPath);
    cfg.setWatchFolders(['/inbox/a', '  /inbox/b  ', '', '/inbox/a', '   ']);
    expect(cfg.getWatchFolders()).toEqual(['/inbox/a', '/inbox/b']);
  });

  it('persists across instances (survives restart)', () => {
    new ConfigStore(dbPath).setWatchFolders(['/scan/one', '/scan/two']);
    expect(new ConfigStore(dbPath).getWatchFolders()).toEqual(['/scan/one', '/scan/two']);
  });

  it('does not disturb the org directory', () => {
    const cfg = new ConfigStore(dbPath);
    const org = cfg.orgDirectory;
    cfg.setWatchFolders(['/x']);
    expect(new ConfigStore(dbPath).orgDirectory).toBe(org);
  });
});
