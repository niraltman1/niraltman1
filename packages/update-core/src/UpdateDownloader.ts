/**
 * UpdateDownloader — downloads an installer binary, tracks progress,
 * and verifies its SHA-256 digest before accepting it.
 *
 * All I/O is local. No external processes are spawned.
 * Network retries: up to 3 attempts with 5-second delays.
 */

import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { VersionManifest } from './types.js';

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes:      number;
  percentComplete: number;
  speed:           number; // bytes/sec
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;

class VerificationError extends Error {
  constructor(message: string) { super(message); this.name = 'VerificationError'; }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash   = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data',  (d: Buffer | string) => hash.update(d));
    stream.on('end',   () => resolve(hash.digest('hex')));
    stream.on('error', (e: Error) => reject(e));
  });
}

export class UpdateDownloader {
  constructor(private readonly dataPath: string) {}

  /**
   * Downloads the installer for `manifest`, writing it to
   * `{dataPath}/updates/installer-{version}.exe`.
   *
   * Verifies the SHA-256 digest. Throws if verification fails (and deletes
   * the corrupt file). Calls `onProgress` periodically during download.
   *
   * If the file already exists and its hash matches the manifest, returns
   * immediately without re-downloading.
   */
  async download(
    manifest: VersionManifest,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<{ filePath: string; verified: boolean }> {
    const updatesDir = join(this.dataPath, 'updates');
    await mkdir(updatesDir, { recursive: true });

    const filePath = join(updatesDir, `installer-${manifest.latestVersion}.exe`);

    // If file already present, skip download and just verify
    if (existsSync(filePath)) {
      const existing = await sha256File(filePath);
      if (existing.toLowerCase() === manifest.sha256.toLowerCase()) {
        return { filePath, verified: true };
      }
      // Corrupt or wrong version — delete and re-download
      await unlink(filePath).catch(() => undefined);
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this._downloadOnce(manifest.assetUrl, filePath, manifest.sha256, onProgress);
        return { filePath, verified: true };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await unlink(filePath).catch(() => undefined);
        // Verification failure is not a network error — do not retry
        if (lastError instanceof VerificationError) throw lastError;
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }

    throw lastError ?? new Error('Download failed after all retries');
  }

  private async _downloadOnce(
    url:        string,
    filePath:   string,
    expectedSha: string,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<void> {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }

    const totalBytes      = Number(res.headers.get('content-length') ?? '0');
    let   bytesDownloaded = 0;
    const startMs         = Date.now();

    const writer = createWriteStream(filePath);

    await new Promise<void>((resolve, reject) => {
      const reader = res.body!.getReader();

      function pump(): void {
        reader.read().then(({ done, value }) => {
          if (done) {
            writer.end();
            return;
          }
          bytesDownloaded += value.length;
          writer.write(Buffer.from(value), (err) => {
            if (err) { reject(err); return; }

            if (onProgress) {
              const elapsedSec = (Date.now() - startMs) / 1000;
              onProgress({
                bytesDownloaded,
                totalBytes,
                percentComplete: totalBytes > 0
                  ? Math.round((bytesDownloaded / totalBytes) * 100)
                  : 0,
                speed: elapsedSec > 0 ? Math.round(bytesDownloaded / elapsedSec) : 0,
              });
            }

            pump();
          });
        }).catch(reject);
      }

      writer.on('finish', resolve);
      writer.on('error',  reject);
      pump();
    });

    // Verify SHA-256
    const actual = await sha256File(filePath);
    if (actual.toLowerCase() !== expectedSha.toLowerCase()) {
      throw new VerificationError(
        `SHA-256 mismatch — expected ${expectedSha.toLowerCase()} got ${actual.toLowerCase()}`,
      );
    }

    // Report 100% on success
    if (onProgress) {
      const elapsedSec = Math.max((Date.now() - startMs) / 1000, 0.001);
      const fileSize   = (await stat(filePath)).size;
      onProgress({
        bytesDownloaded: fileSize,
        totalBytes:      fileSize,
        percentComplete: 100,
        speed:           Math.round(fileSize / elapsedSec),
      });
    }
  }
}
