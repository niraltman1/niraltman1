/**
 * Simple JSON config store for runtime settings that must survive restarts.
 * Stored at <db-dir>/factum-il-config.json alongside the SQLite database.
 *
 * Reads the registry key HKLM\SOFTWARE\Factum IL\OrgDirectory (written by
 * the Inno Setup installer) as the initial fallback, then allows in-app overrides.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULT_ORG_DIR = 'C:\\2026 אדמיניסטרציה - משרד עורכי דין אלטמן';

interface ConfigData {
  orgDirectory:      string;
  setupCompleted?:   boolean;
  setupCompletedAt?: string; // ISO 8601
}

function readRegistryOrgDir(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    // Dynamic import keeps non-Windows envs from crashing at import time.
    // We require() synchronously here because config-store is loaded at startup.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execFileSync('reg', [
      'query', 'HKLM\\SOFTWARE\\Factum IL', '/v', 'OrgDirectory',
    ], { encoding: 'utf-8', timeout: 3_000 });
    const m = /OrgDirectory\s+REG_SZ\s+(.+)/.exec(out);
    return m ? m[1]!.trim() : null;
  } catch {
    return null;
  }
}

export class ConfigStore {
  private readonly configPath: string;
  private data: ConfigData;

  constructor(dbPath: string) {
    this.configPath = join(dirname(dbPath), 'factum-il-config.json');
    this.data = this.load();
  }

  private load(): ConfigData {
    if (existsSync(this.configPath)) {
      try {
        return JSON.parse(readFileSync(this.configPath, 'utf-8')) as ConfigData;
      } catch { /* fall through */ }
    }
    // First run: seed from installer registry key or env var or default
    const orgDirectory =
      process.env['FACTUM_IL_ORG_DIR'] ??
      readRegistryOrgDir() ??
      DEFAULT_ORG_DIR;
    const initial: ConfigData = { orgDirectory };
    this.persist(initial);
    return initial;
  }

  private persist(data: ConfigData): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  get orgDirectory(): string { return this.data.orgDirectory; }

  setOrgDirectory(path: string): void {
    this.data.orgDirectory = path;
    this.persist(this.data);
  }

  isSetupCompleted(): boolean {
    return this.data.setupCompleted ?? false;
  }

  markSetupCompleted(): void {
    this.data.setupCompleted   = true;
    this.data.setupCompletedAt = new Date().toISOString();
    this.persist(this.data);
  }

  toJSON(): ConfigData {
    return { ...this.data };
  }
}
