import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { logger } from '@factum-il/shared';

export interface FileMetadata {
  readonly path: string;
  readonly hash: string;
  readonly sizeBytes: number;
  readonly mtimeUtc: string;
}

/**
 * Provides file hashing and duplicate detection services.
 * Uses SHA-256 streaming to handle arbitrarily large files without loading
 * them entirely into memory.
 */
export class HashService {
  /**
   * Computes the SHA-256 hash of a file by streaming its content.
   */
  async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash   = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Collects full metadata for a file: hash, size, mtime.
   */
  async collectMetadata(filePath: string): Promise<FileMetadata> {
    const hash   = await this.hashFile(filePath);
    const stat   = statSync(filePath);
    return {
      path:      filePath,
      hash,
      sizeBytes: stat.size,
      mtimeUtc:  stat.mtimeMs ? new Date(stat.mtimeMs).toISOString() : '',
    };
  }

  /**
   * Returns true if the hash of `filePath` matches `expectedHash`.
   */
  async verify(filePath: string, expectedHash: string): Promise<boolean> {
    const actual = await this.hashFile(filePath);
    const match  = actual === expectedHash.toLowerCase();
    if (!match) {
      logger.warn(`Hash mismatch: ${filePath}`, {
        category: 'system',
        agentSource: 'PipelineEngine',
        fileHash: actual,
      });
    }
    return match;
  }
}
