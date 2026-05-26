/**
 * Archive Miner — scans legacy folders (2017–2021) and ingests historical files.
 *
 * Strategy:
 *   1. Walk the target directory recursively (breadth-first)
 *   2. For each eligible file:
 *      a. Run it through the Vacuum Protocol (media-pipeline.ts)
 *         → SHA-256 dedup → OCR → field discovery → rejection scan
 *      b. The RAG worker will later classify the document type
 *   3. Report progress per batch
 *
 * Eligible files: .pdf, .docx, .doc, .jpg, .jpeg, .png, .heic, .tiff
 * Excluded paths:  same data firewall as media-pipeline (סיעוד, רפואה, etc.)
 *
 * Concurrency: honours resource-controller (day/night/turbo) for worker slots.
 * Running during night (22:00-07:00) will use 3 parallel slots; day = 1.
 *
 * This runs as an on-demand API call — NOT a background daemon.
 * Large archives (>10,000 files) should be called with a limit parameter.
 */

import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, extname } from 'node:path';
import type { Repos } from '../db.js';
import { MediaPipeline } from './media-pipeline.js';
import { getWorkerConcurrency } from './resource-controller.js';

function toLongPath(p: string): string {
  if (process.platform === 'win32' && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\')) {
    return `\\\\?\\${p.replace(/\//g, '\\')}`;
  }
  return p;
}

const ELIGIBLE_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png', '.heic', '.tiff', '.webp',
  '.ogg', '.m4a', '.mp3', '.wav',
]);

const EXCLUDED_PATTERNS = [
  /node_modules/i,
  /\.git/,
  /[/\\]סיעוד[/\\]/u,
  /[/\\]רפואה[/\\]/u,
  /[/\\]Nursing[/\\]/i,
  /[/\\]Medical[/\\]/i,
  /[/\\]\.trash[/\\]/i,
  /[/\\]__MACOSX[/\\]/i,
];

function isExcluded(path: string): boolean {
  return EXCLUDED_PATTERNS.some((re) => re.test(path));
}

export interface MineResult {
  scanned:   number;
  ingested:  number;
  skipped:   number;
  failed:    number;
  errors:    string[];
  durationMs: number;
}

export interface MineOptions {
  rootDir:    string;
  limit?:     number;    // max files to process (default: unlimited)
  outputDir?: string;    // where converted PDFs land
  force?:     boolean;   // bypass dedup — re-processes even if hash is already registered
}

async function collectFiles(rootDir: string, limit: number): Promise<string[]> {
  const result: string[] = [];
  const queue  = [rootDir];

  while (queue.length > 0 && result.length < limit) {
    const dir = queue.shift()!;
    if (isExcluded(dir)) continue;

    let entries: Dirent[];
    try {
      // withFileTypes avoids extra stat() calls and naturally skips
      // Windows junction directories (My Music, My Pictures, etc.)
      entries = await readdir(toLongPath(dir), { withFileTypes: true });
    } catch {
      continue; // permission denied or inaccessible path
    }

    for (const entry of entries) {
      if (result.length >= limit) break;
      const fullPath = join(dir, entry.name);
      if (isExcluded(fullPath)) continue;

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (ELIGIBLE_EXTENSIONS.has(ext)) {
          result.push(fullPath);
        }
      }
      // symlinks and junctions (isSymbolicLink) are silently skipped
    }
  }

  return result;
}

// Run an array of async tasks with limited concurrency
async function runConcurrent<T>(
  tasks:       (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]!();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export async function mineArchive(
  repos:   Repos,
  options: MineOptions,
): Promise<MineResult> {
  const start  = Date.now();
  const limit  = options.limit ?? 10_000;
  const result: MineResult = {
    scanned: 0, ingested: 0, skipped: 0, failed: 0, errors: [], durationMs: 0,
  };

  // Check root exists (use toLongPath for Hebrew/Unicode paths on Windows)
  try {
    const s = await stat(toLongPath(options.rootDir));
    if (!s.isDirectory()) {
      result.errors.push(`${options.rootDir} אינה תיקייה`);
      return result;
    }
  } catch {
    result.errors.push(`תיקיית המקור לא נמצאה: ${options.rootDir}`);
    return result;
  }

  const files = await collectFiles(options.rootDir, limit);
  result.scanned = files.length;

  const pipeline   = new MediaPipeline(repos.processedFiles, repos.documents, repos.evidence, repos.clients, repos.cases, repos.pipelineLogs, repos.contacts);
  const concurrency = getWorkerConcurrency();

  const tasks = files.map((filePath) => async () => {
    try {
      const res = await pipeline.ingest({
        filePath,
        ...(options.outputDir ? { outputDir: options.outputDir } : {}),
        ...(options.force     ? { force: true }                  : {}),
      });

      switch (res.status) {
        case 'registered':
        case 'converted_to_pdf':
          result.ingested++;
          break;
        case 'already_registered':
        case 'path_updated':
        case 'excluded':
          result.skipped++;
          break;
        case 'failed':
          result.failed++;
          result.errors.push(`${filePath}: ${res.message}`);
          break;
      }
    } catch (e) {
      result.failed++;
      result.errors.push(`${filePath}: ${String(e)}`);
    }
  });

  await runConcurrent(tasks, concurrency);

  result.durationMs = Date.now() - start;
  return result;
}
