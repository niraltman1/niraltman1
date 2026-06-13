/**
 * DocumentInventoryAnalyzer — walks a folder tree and produces a DocumentMigrationReport.
 * Read-only. Computes hash-based duplicates for files under 50 MB.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { DocumentMigrationReport, DocumentFileInfo } from './types.js';

const MAX_HASH_SIZE  = 50 * 1024 * 1024; // 50 MB
const SUPPORTED_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.tiff', '.msg', '.eml']);

// Rough processing time: 30 seconds per supported document
const SEC_PER_DOC = 30;

export class DocumentInventoryAnalyzer {
  analyze(rootPath: string): DocumentMigrationReport {
    if (!existsSync(rootPath)) {
      return this.emptyReport(rootPath, [`Folder not found: ${rootPath}`]);
    }

    const files:     DocumentFileInfo[] = [];
    const warnings:  string[]           = [];
    this.walk(rootPath, files);

    const byExtension: Record<string, number> = {};
    let supported = 0, unsupported = 0;

    for (const f of files) {
      byExtension[f.extension] = (byExtension[f.extension] ?? 0) + 1;
      if (f.isSupported) supported++; else unsupported++;
    }

    // Duplicate detection via SHA-256 of file content (small files only)
    const hashes = new Map<string, string[]>();
    for (const f of files) {
      if (!f.isSupported) continue;
      if (f.sizeBytes > MAX_HASH_SIZE) continue;
      try {
        const buf  = readFileSync(f.path);
        const hash = createHash('sha256').update(buf).digest('hex');
        const list = hashes.get(hash) ?? [];
        list.push(f.path);
        hashes.set(hash, list);
      } catch { /* skip unreadable */ }
    }

    let duplicates = 0;
    for (const paths of hashes.values()) {
      if (paths.length > 1) {
        duplicates += paths.length - 1;
        warnings.push(`Duplicate detected: ${paths.join(', ')}`);
      }
    }

    const estimatedHours = Math.ceil((supported * SEC_PER_DOC) / 3600);

    return {
      generatedAt:      new Date().toISOString(),
      rootPath,
      totalFiles:       files.length,
      supportedFiles:   supported,
      unsupportedFiles: unsupported,
      duplicates,
      byExtension,
      estimatedHours,
      warnings,
    };
  }

  private walk(dir: string, out: DocumentFileInfo[]): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const st  = statSync(full);
        const ext = extname(entry).toLowerCase();
        if (st.isDirectory()) {
          this.walk(full, out);
        } else if (st.isFile()) {
          out.push({
            path:        full,
            extension:   ext,
            sizeBytes:   st.size,
            isSupported: SUPPORTED_EXTS.has(ext),
          });
        }
      } catch { /* skip inaccessible */ }
    }
  }

  private emptyReport(rootPath: string, warnings: string[]): DocumentMigrationReport {
    return {
      generatedAt: new Date().toISOString(),
      rootPath,
      totalFiles:      0,
      supportedFiles:  0,
      unsupportedFiles: 0,
      duplicates:      0,
      byExtension:     {},
      estimatedHours:  0,
      warnings,
    };
  }
}
