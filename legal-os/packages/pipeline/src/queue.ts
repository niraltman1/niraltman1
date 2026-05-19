import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { logger } from '@legal-os/shared';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.docx', '.doc']);

export interface QueueItem {
  readonly absolutePath: string;
  readonly filename: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly discoveredAt: string;
}

/**
 * Scans a directory tree for supported legal documents and returns them
 * as an ordered queue ready for ingestion.
 * Skips hidden files, system files, and unsupported extensions.
 */
export class FileQueue {
  private items: QueueItem[] = [];

  discover(rootPath: string): QueueItem[] {
    this.items = [];
    this.walk(rootPath);
    logger.info(`File discovery complete: ${this.items.length} files found in ${rootPath}`, {
      category: 'system',
      agentSource: 'PipelineEngine',
    });
    return [...this.items];
  }

  private walk(dirPath: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch (err) {
      logger.warn(`Cannot read directory: ${dirPath}: ${String(err)}`, {
        category: 'system',
        agentSource: 'PipelineEngine',
      });
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || entry.startsWith('~$')) continue;

      const fullPath = join(dirPath, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        this.walk(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        this.items.push({
          absolutePath: fullPath,
          filename:     entry,
          extension:    ext.replace('.', ''),
          sizeBytes:    stat.size,
          discoveredAt: new Date().toISOString(),
        });
      }
    }
  }
}
