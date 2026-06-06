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
 *  - Symlink loops → prevented via inode tracking
 *  - Destination collisions → detected and skipped (no overwrites)
 *  - Case number validation → 8 Israeli court types validated
 */

import { join, dirname, basename, extname, resolve, sep } from 'node:path';
import { readdir, stat, mkdir, rename, open as fsOpen } from 'node:fs/promises';
import { EffortController } from './effort-controller.js';
import type { EffortReport } from './effort-controller.js';

// Israeli court case number patterns (8 types)
const ISRAELI_CASE_TYPES = {
  'ת"א': /^ת["״]א\s*\d+$/,   // תיק אזרחי בסדר דין רגיל
  'ת"פ': /^ת["״]פ\s*\d+$/,   // תיק פלילי
  'בג"ץ': /^בג["״]ץ\s*\d+$/, // בג"ץ
  'ע"א': /^ע["״]א\s*\d+$/,   // עררית אזורית
  'עב': /^עב\s*\d+$/,         // ערעור בעל כורח
  'תמש': /^תמש\s*\d+$/,      // תיק משפחה
  'עת"מ': /^עת["״]מ\s*\d+$/, // עררית משפטית
  'rg': /^\d{1,5}[-–]\d{2}[-–]\d{2,6}$/, // Generic: NNNN-YY-ZZZZ
};

const CASE_NUMBER_RE = /(\d{1,5}[-–]\d{2}[-–]\d{2,6}|ת["״]פ\s*\d+|ת["״]ד\s*\d+|ע["״]פ\s*\d+|רת["״]פ\s*\d+)/;
const FORBIDDEN_CHARS_RE = /[\\/:*?"<>|]/g;
const SUPPORTED_EXTS = new Set([
  // Documents
  '.pdf', '.docx', '.doc', '.txt', '.odt',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'
]);

// ── OS helpers ───────────────────────────────────────────────────────────

function toLongPath(p: string): string {
  if (process.platform === 'win32' && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\')) {
    return `\\\\?\\${p.replace(/\//g, '\\')}`;
  }
  return p;
}

function sanitizeFolderName(name: string): string {
  return name.replace(FORBIDDEN_CHARS_RE, '_').replace(/\s+/g, ' ').trim();
}

/** Returns true only when `child` is the same path as `root` or a direct descendant of it. */
function containsPath(child: string, root: string): boolean {
  return child === root || child.startsWith(root + sep);
}

/**
 * Validates that a matched case number is actually a valid Israeli court case.
 * Prevents false positives from generic number patterns.
 */
function isValidIsraeliCaseNumber(caseNumber: string): boolean {
  if (!caseNumber) return false;
  
  // Check against known Israeli patterns
  for (const pattern of Object.values(ISRAELI_CASE_TYPES)) {
    if (pattern.test(caseNumber.trim())) {
      return true;
    }
  }
  
  return false;
}

// ── PDF integrity check ──────────────────────────────────────────────────────

/**
 * Validates PDF file integrity by checking:
 * 1. File size > 0
 * 2. Valid PDF header (%PDF)
 * 3. Valid PDF footer (%%EOF)
 * 4. Encryption status
 */
async function isPdfSafe(filePath: string, root: string): Promise<{ valid: boolean; encrypted: boolean }> {
  const resolved = resolve(filePath);
  if (!containsPath(resolved, root)) {
    return { valid: false, encrypted: false };
  }
  let fh: Awaited<ReturnType<typeof fsOpen>> | null = null;
  try {
    const longPath = toLongPath(resolved);
    const filestat = await stat(longPath);
    
    // Reject zero-length files
    if (filestat.size === 0) {
      return { valid: false, encrypted: false };
    }
    
    fh = await fsOpen(longPath, 'r');
    
    // Check header
    const headerBuf = Buffer.alloc(8);
    const { bytesRead: headerBytes } = await fh.read(headerBuf, 0, 8, 0);
    const headerStr = headerBuf.subarray(0, headerBytes).toString('latin1');
    
    if (!headerStr.startsWith('%PDF')) {
      return { valid: false, encrypted: false };
    }
    
    // Check footer (last 1KB, look for %%EOF)
    const footerSize = Math.min(1024, filestat.size);
    const footerBuf = Buffer.alloc(footerSize);
    await fh.read(footerBuf, 0, footerSize, Math.max(0, filestat.size - footerSize));
    const footerStr = footerBuf.toString('latin1');
    
    const hasEof = footerStr.includes('%%EOF');
    
    // Check for encryption
    const chunkBuf = Buffer.alloc(4096);
    const { bytesRead } = await fh.read(chunkBuf, 0, 4096, 0);
    const chunk = chunkBuf.subarray(0, bytesRead).toString('latin1');
    const encrypted = chunk.includes('/Encrypt');
    
    return { valid: hasEof, encrypted };
  } catch {
    return { valid: false, encrypted: false };
  } finally {
    await fh?.close().catch(() => undefined);
  }
}

// ── Image integrity check ────────────────────────────────────────────────────

/**
 * Validates image file integrity by checking magic bytes (file signatures).
 * Returns false if file is zero-length or has invalid header.
 */
async function isImageSafe(filePath: string, root: string): Promise<boolean> {
  const resolved = resolve(filePath);
  if (!containsPath(resolved, root)) {
    return false;
  }
  let fh: Awaited<ReturnType<typeof fsOpen>> | null = null;
  try {
    const longPath = toLongPath(resolved);
    const filestat = await stat(longPath);
    
    // Reject zero-length files
    if (filestat.size === 0) {
      return false;
    }
    
    fh = await fsOpen(longPath, 'r');
    const headerBuf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(headerBuf, 0, 16, 0);
    
    if (bytesRead === 0) {
      return false;
    }
    
    const header = headerBuf.subarray(0, bytesRead);
    
    // Check for common image magic bytes
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
    const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46; // GIF87a or GIF89a
    const isBmp = header[0] === 0x42 && header[1] === 0x4D; // BM
    const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50; // WEBP
    const isTiff = (header[0] === 0x49 && header[1] === 0x49) || (header[0] === 0x4D && header[1] === 0x4D); // Little/Big endian TIFF
    const isSvg = header.toString('utf8').startsWith('<svg') || header.toString('utf8').includes('<?xml');
    const isIco = header[0] === 0x00 && header[1] === 0x00 && header[2] === 0x01;
    
    return isJpeg || isPng || isGif || isBmp || isWebp || isTiff || isSvg || isIco;
  } catch {
    return false;
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

/**
 * Recursively scans a directory tree, collecting supported files.
 * Prevents infinite loops by tracking visited inodes (device:inode pairs).
 * Limits concurrency to avoid overwhelming the OS with file descriptors.
 */
async function scanDir(
  dir: string,
  out: string[],
  errors: string[],
  root: string,
  visited: Map<string, boolean> = new Map()
): Promise<void> {
  try {
    const resolved = resolve(dir);
    if (!containsPath(resolved, root)) {
      errors.push(`סריקת תיקייה נכשלה: ${dir} — חריגה מגבולות מותרים`);
      return;
    }
    const longPath = toLongPath(resolved);
    const dirstat = await stat(longPath);

    // Track inode to prevent symlink loops
    const inode = `${dirstat.dev}:${dirstat.ino}`;
    if (visited.has(inode)) {
      return; // Already scanned this directory (symlink loop detected)
    }
    visited.set(inode, true);

    const items = await readdir(longPath, { withFileTypes: true });
    
    // Limit concurrency to 10 concurrent directory operations
    const concurrencyLimit = 10;
    let running = 0;
    const pending: Promise<void>[] = [];
    
    for (const item of items) {
      if (item.isSymbolicLink()) continue; // skip symbolic links
      
      const full = join(dir, item.name);
      
      if (item.isDirectory()) {
        const task = (async () => {
          try {
            await scanDir(full, out, errors, root, visited);
          } catch (e) {
            errors.push(
              `תיקייה: ${full}, שגיאה: ${(e as NodeJS.ErrnoException).code || 'UNKNOWN'}`
            );
          }
        })();
        
        running++;
        if (running >= concurrencyLimit) {
          await Promise.race(pending);
          running--;
        }
        pending.push(task);
      } else if (item.isFile() && SUPPORTED_EXTS.has(extname(item.name).toLowerCase())) {
        out.push(full);
      }
    }
    
    // Wait for remaining tasks
    await Promise.all(pending);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code || 'UNKNOWN';
    errors.push(`סריקת תיקייה נכשלה: ${dir}, שגיאה: ${code}`);
  }
}

// ── Public types ───────────────────────────────────────────────────────────

export type VacuumAction = 'move' | 'keep' | 'pending' | 'skip' | 'skip_encrypted' | 'skip_corrupt' | 'skip_collision';

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

// ── Main runner ───────────────────────────────────────────────────────────

export async function runVacuumProtocol(opts: VacuumOptions): Promise<VacuumReport> {
  const { targetDir, orgDir, dryRun, onProgress } = opts;
  
  // Validate input paths
  if (!targetDir || !targetDir.trim()) {
    throw new Error('targetDir נדרש ובעל ערך');
  }
  if (!orgDir || !orgDir.trim()) {
    throw new Error('orgDir נדרש ובעל ערך');
  }
  
  const absTarget = resolve(targetDir);
  const absOrg = resolve(orgDir);
  
  if (absTarget === absOrg) {
    throw new Error('targetDir ו-orgDir לא יכולים להיות זהים');
  }
  
  const effort  = new EffortController({ ceilPercent: opts.ceilPercent ?? 70 });
  const startedAt = new Date().toISOString();
  const filePaths: string[] = [];
  const errors:    string[] = [];

  await scanDir(absTarget, filePaths, errors, absTarget);

  const entries:   VacuumEntry[] = [];
  let moveCount    = 0;
  let pendingCount = 0;
  let skipCount    = 0;

  for (let idx = 0; idx < filePaths.length; idx++) {
    const filePath   = filePaths[idx]!;
    const fileName   = basename(filePath);
    const detectedAt = new Date().toISOString();

    // Sample CPU after every file to ensure accurate throttling
    await effort.throttle();

    const fileExt = extname(fileName).toLowerCase();

    // ── Validate file integrity ───────────────────────────────────────────
    if (fileExt === '.pdf') {
      const { valid, encrypted } = await isPdfSafe(filePath, absTarget);
      if (!valid) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber: null, expectedPath: null,
          action: 'skip_corrupt', contradiction: 'PDF פגום או ריק', detectedAt,
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

    // Validate image files
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'].includes(fileExt)) {
      const validImage = await isImageSafe(filePath, absTarget);
      if (!validImage) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber: null, expectedPath: null,
          action: 'skip_corrupt', contradiction: 'תמונה פגומה או ריקה', detectedAt,
        };
        entries.push(entry);
        skipCount++;
        onProgress?.(entry);
        continue;
      }
    }

    // ── Case number extraction and validation ────────────────────────────────
    const m = CASE_NUMBER_RE.exec(fileName);
    const caseNumberMatch = m ? (m[1] ?? null) : null;

    // Validate that the matched number is actually a known Israeli case type
    const caseNumber = caseNumberMatch && isValidIsraeliCaseNumber(caseNumberMatch)
      ? caseNumberMatch
      : null;

    if (!caseNumber) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber: null, expectedPath: null,
        action: 'skip', contradiction: 'מספר תיק לא זוהה או לא חוקי', detectedAt,
      };
      entries.push(entry);
      skipCount++;
      onProgress?.(entry);
      continue;
    }

    const safeFolder  = sanitizeFolderName(caseNumber);
    const expectedPath = join(absOrg, safeFolder, fileName);

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
    let destinationExists = false;
    
    try {
      await stat(toLongPath(expectedPath));
      destinationExists = true;
      contradiction = `קובץ קיים בנתיב היעד — נדרש מיזוג ידני`;
    } catch {
      /* target is free */
    }

    if (dryRun) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'move', contradiction, detectedAt,
      };
      entries.push(entry);
      if (!contradiction) moveCount++;
      onProgress?.(entry);
      continue;
    }

    // In non-dryRun mode, skip if destination already exists
    if (destinationExists) {
      const entry: VacuumEntry = {
        filePath, fileName, caseNumber, expectedPath,
        action: 'skip_collision', contradiction, detectedAt,
      };
      entries.push(entry);
      skipCount++;
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
        action: 'move', contradiction: null, detectedAt,
      };
      entries.push(entry);
      moveCount++;
      onProgress?.(entry);
    } catch (e) {
      const msg = String(e);
      const code = (e as NodeJS.ErrnoException).code || 'UNKNOWN';
      
      if (msg.includes('EPERM') || msg.includes('EACCES')) {
        const entry: VacuumEntry = {
          filePath, fileName, caseNumber, expectedPath,
          action: 'pending', contradiction: `הרשאה נדחתה (${code})`, detectedAt,
        };
        entries.push(entry);
        pendingCount++;
        onProgress?.(entry);
      } else {
        errors.push(`קובץ: ${filePath}, שגיאה: ${code}, פרטים: ${msg}`);
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
