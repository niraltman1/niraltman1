/**
 * Executes signed Action Plan entries — moves / renames files on disk.
 *
 * Strategy per action_type:
 *   RENAME          → rename in-place (same directory, new filename)
 *   MOVE            → move to suggested directory, keep original filename
 *   RENAME_AND_MOVE → move to suggested directory, use suggested filename
 *   SKIP            → no-op, mark executed immediately
 *
 * Destination base: [BaseDir]/[ClientName]/[CaseId?]/[SuggestedFilename]
 * BaseDir resolves to:
 *   - FACTUM_IL_ROOT env var   (set by installer on Windows)
 *   - process.cwd()/_data/files  (development / Linux fallback)
 */

import { rename, mkdir, copyFile, unlink, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ActionPlanEntry } from '@factum-il/shared';

export interface ExecuteResult {
  planId:      string;
  success:     boolean;
  finalPath:   string | null;
  errorMsg:    string | null;
}

const BASE_DIR =
  process.env['FACTUM_IL_ROOT'] ??
  join(process.cwd(), '_data', 'files');

/**
 * Resolve the final destination path for an action plan entry.
 * If suggestedPath is an absolute path, use it directly.
 * Otherwise treat it as a relative path under BASE_DIR.
 */
function resolveDest(entry: ActionPlanEntry): string {
  const suggested = entry.suggestedPath;

  if (suggested && (suggested.startsWith('/') || /^[A-Za-z]:[\\/]/.test(suggested))) {
    return suggested; // already absolute (Windows or Unix)
  }

  const filename = entry.suggestedName ?? entry.originalName;
  if (suggested) {
    return join(BASE_DIR, suggested, filename);
  }
  return join(BASE_DIR, filename);
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function atomicMove(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest); // fast, same-volume atomic
  } catch {
    // Cross-volume: copy + unlink
    await copyFile(src, dest);
    await unlink(src);
  }
}

export async function executeEntry(entry: ActionPlanEntry): Promise<ExecuteResult> {
  const { planId, actionType, originalPath } = entry;

  if (actionType === 'SKIP') {
    return { planId, success: true, finalPath: originalPath, errorMsg: null };
  }

  // Verify source exists
  try {
    await access(originalPath);
  } catch {
    return {
      planId,
      success:   false,
      finalPath: null,
      errorMsg:  `קובץ מקור לא נמצא: ${originalPath}`,
    };
  }

  const dest = resolveDest(entry);

  if (dest === originalPath) {
    return { planId, success: true, finalPath: originalPath, errorMsg: null };
  }

  try {
    await ensureDir(dest);
    await atomicMove(originalPath, dest);
    return { planId, success: true, finalPath: dest, errorMsg: null };
  } catch (e) {
    return {
      planId,
      success:   false,
      finalPath: null,
      errorMsg:  `שגיאה בהעברת קובץ: ${String(e)}`,
    };
  }
}

export async function executeEntries(entries: ActionPlanEntry[]): Promise<ExecuteResult[]> {
  return Promise.all(entries.map(executeEntry));
}
