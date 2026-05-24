import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * Compute SHA-256 digest of a file using streaming I/O.
 * No file size limit — 1 GB files handled with constant memory.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash   = createHash('sha256');
    const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
    stream.on('end',  ()             => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** Return file size in bytes, or null if stat fails. */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const s = await stat(filePath);
    return s.size;
  } catch {
    return null;
  }
}

/** Detect MIME type from file extension (no magic bytes — for speed). */
export function mimeFromExtension(ext: string): string | null {
  const map: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.tiff': 'image/tiff',
    '.tif':  'image/tiff',
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
  };
  return map[ext.toLowerCase()] ?? null;
}

export function isImageExtension(ext: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tiff', '.tif'].includes(ext.toLowerCase());
}
