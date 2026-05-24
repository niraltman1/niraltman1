/**
 * Vacuum Protocol — recursive document organizer.
 *
 * Scans a target directory tree, detects legal case numbers in file names,
 * and moves files to the canonical organisation directory.
 *
 * Safety guarantees:
 *  - dryRun=true → no files are moved; returns a full preview log
 *  - PermissionError / locked files → status 'pending', batch continues
 *  - Windows long paths → automatically prefixed with \\?\ when on Win32
 *  - Forbidden OS characters in folder names → sanitized with regex
 *  - PDF integrity validation → skip encrypted / corrupt PDFs
 */

import { join, dirname, basename, extname } from 'node:path';
import { readdir, stat, mkdir, rename, open as fsOpen } from 'node:fs/promises';
import { EffortController } from './effort-controller.js';
import type { EffortReport } from './effort-controller.js';

const CASE_NUMBER_RE = /(\d{1,5}[-–]\d{2}[-–]\d{2,6}|ת["״]פ\s*\d+|ת["״]ד\s*\d+|ע["״]פ\s*\d+|רת["״]פ\s*\d+)/;
const FORBIDDEN_CHARS_RE = /[\\/:*?"<>|]/g;
const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.doc', '.txt', '.odt']);

// ── OS helpers ───────────────────────────────────────────────────────────────

function toLongPath(p: string): string {
  if (process.platform === 'win32' && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\')) {
    return `\\\\?\\${p.replace(/\//g, '\\')}`;
  }
  return p;
}

function sanitizeFolderName(name: string): string {
  return name.replace(FORBIDDEN_CHARS_RE, '_').replace(/\s+/g, ' ').trim();
}

// ── PDF integrity check ──────────────────────────────────────────────────────

async function isPdfSafe(filePath: string): Promise<{ valid: boolean; encrypted: boolean }> {
  let fh: Awaited<ReturnType<typeof fsOpen>> | null = null;
  try {
    fh = await fsOpen(toLongPath(filePath), 'r');
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(buf, 0, 1024, 0);
    const chunk = buf.subarray(0, bytesRead).toString('latin1');
    const valid = chunk.startsWith('%PDF');
    const encrypted = valid && chunk.includes('/Encrypt');
    return { valid, encrypted };
  } catch {
    return { valid: false, encrypted: false };
  } finally {
    await fh?.close().catch(() => undefined);
  }
}

// ── File lock detection ──────────────────────────────────────────────────────

async function isFileLocked(filePath: string): Promise<boolean> {
  let fh: Awaited<ReturnType<typeof fsOpen>> | null = null;
  try {
    fh = await fsOpen(toLongPath(filePath), 'r+');
    await fh.close();
    return false;
  } catch {
    return true;
  } finally {
    await fh?.close().catch(() => undefined);
  }
}

// ── Directory scanner ────────────────────────────────────────────────────────

async function scanDir(dir: string, out: string[], errors: string[]): Promise<void> {
  try {
    const items = await readdir(toLongPath(dir), { withFileTypes: true });
    await Promise.all(items.map(async (item) => {
      if (item.isSymbolicLink()) return; // skip junctions (My Music etc.)
      const full = join(dir, item.name);
      if (item.isDirectory()) {
        await scanDir(full, out, errors);
      } else if (item.isFile() && SUPPORTED_EXTS.has(extname(item.name).toLowerCase())) {
        out.push(full);
      }
    }));
  } catch (e) {
    errors.push(`שגיאה בסריקת תיקייה ${dir}: ${String(e)}`);
  }
}

// ── Public types ─────────────────────────────────────────────────────────────

export type VacuumAction = 'move' | 'keep' | 'pending' | 'skip' | 'skip_encrypted' | 'skip_corrupt';

export interface VacuumEntry {
  filePath:     string;
  fileName:     string;
  caseNumber:   string | null;
  expectedPath: string | null;
  action:       VacuumAction;
  contradiction: string | null;
  detectedAt:   string;
}

export interface VacuumReport {
  dryRun:        boolean;
  scannedCount:  number;
  moveCount:     number;
  pendingCount:  number;
  skipCount:     number;
  entries:       VacuumEntry[];
  errors:        string[];
  startedAt:     string;
  finishedAt:    string;
  effortReport:  EffortReport;
}

export interface VacuumOptions {
  targetDir:    string;
  orgDir:       string;
  dryRun:       boolean;
  ceilPercent?: number;
  onProgress?:  (entry: VacuumEntry) => void;
}

// ── Main runner ──────────────────────────────────────────────────────────────

export async function runVacuumProtocol(opts: VacuumOptions): Promise<VacuumReport> {
  const { targetDir, orgDir, dryRun, onProgress } = opts;
  const effort  = new EffortController({ ceilPercent: opts.ceilPercent ?? 70 });
  const startedAt = new Date().toISOString();
  const filePaths: string[] = [];
  const errors:    string[] = [];

  await scanDir(targetDir, filePaths, errors);

  const entries:   VacuumEntry[] = [];
  let moveCount    = 0;
  let pendingCount = 0;
  let skipCount    = 0;

  for (let idx = 0; idx < filePaths.length; idx++) {
    const filePath   = filePaths[idx]!;
    const fileName   = basename(filePath);
    const detectedAt = new Date().toISOString();

    // Sample CPU every 10 files to avoid 250ms overhead per file
    if (idx % 10 === 0) await effort.throttle();

    if (extname(fileName).toLowerCase() === '.pdf') {
      const { valid, encrypted } = await isPdfSafe(filePath);
      if (!valid) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber: null, expectedPath: null,
          action: 'skip_corrupt', contradiction: 'PDF פגום', detectedAt,
        };
        entries.push(entry);
        skipCount++;
        onProgress?.(entry);
        continue;
      }
      if (encrypted) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber: null, expectedPath: null,
          action: 'skip_encrypted', contradiction: 'PDF מוצפן', detectedAt,
        };
        entries.push(entry);
        skipCount++;
        onProgress?.(entry);
        continue;
      }
    }

    // ── Case number extraction ────────────────────────────────────────────
    const m = CASE_NUMBER_RE.exec(fileName);
    const caseNumber = m ? (m[1] ?? null) : null;

    if (!caseNumber) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber: null, expectedPath: null,
        action: 'skip', contradiction: 'לא זוהה מספר תיק', detectedAt,
      };
      entries.push(entry);
      skipCount++;
      onProgress?.(entry);
      continue;
    }

    const safeFolder  = sanitizeFolderName(caseNumber);
    const expectedPath = join(orgDir, safeFolder, fileName);

    if (filePath === expectedPath) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'keep', contradiction: null, detectedAt,
      };
      entries.push(entry);
      onProgress?.(entry);
      continue;
    }

    // ── Check for destination collision ───────────────────────────────────
    let contradiction: string | null = null;
    try {
      await stat(toLongPath(expectedPath));
      contradiction = `קובץ קיים בנתיב היעד — ידרש מיזוג ידני`;
    } catch { /* target free */ }

    if (dryRun) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'move', contradiction, detectedAt,
      };
      entries.push(entry);
      moveCount++;
      onProgress?.(entry);
      continue;
    }

    // ── Apply move ────────────────────────────────────────────────────────
    const locked = await isFileLocked(filePath);
    if (locked) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'pending', contradiction: 'קובץ נעול על-ידי תהליך אחר', detectedAt,
      };
      entries.push(entry);
      pendingCount++;
      onProgress?.(entry);
      continue;
    }

    try {
      await mkdir(toLongPath(dirname(expectedPath)), { recursive: true });
      await rename(toLongPath(filePath), toLongPath(expectedPath));
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'move', contradiction, detectedAt,
      };
      entries.push(entry);
      moveCount++;
      onProgress?.(entry);
    } catch (e) {
      const msg = String(e);
      if (msg.includes('EPERM') || msg.includes('EACCES')) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber, expectedPath,
          action: 'pending', contradiction: `הרשאה נדחתה: ${msg}`, detectedAt,
        };
        entries.push(entry);
        pendingCount++;
        onProgress?.(entry);
      } else {
        errors.push(`שגיאה בהזזת קובץ ${filePath}: ${msg}`);
        skipCount++;
      }
    }
  }

  return {
    dryRun,
    scannedCount:  filePaths.length,
    moveCount,
    pendingCount,
    skipCount,
    entries,
    errors,
    startedAt,
    finishedAt:    new Date().toISOString(),
    effortReport:  effort.report(),
  };
}
