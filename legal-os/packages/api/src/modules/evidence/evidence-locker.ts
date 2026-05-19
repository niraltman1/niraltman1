import { copyFile, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, basename, extname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { EvidenceRepository, EvidenceItem } from '@legal-os/database';
import { computeFileHash, mimeFromExtension } from '../../utils/file-hash.js';

const execFileAsync = promisify(execFile);

export interface LockOptions {
  sourcePath:  string;
  caseId?:     number | null;
  clientId?:   number | null;
  documentId?: number | null;
  sourceApp?:  'whatsapp' | 'email' | 'manual';
  mediaType?:  'voice_note' | 'image' | 'message' | 'attachment' | 'file';
  notes?:      string | null;
}

export interface LockResult {
  status:     'locked' | 'already_locked' | 'failed';
  evidenceId: number | null;
  lockerPath: string | null;
  message:    string;
}

type MediaType = 'voice_note' | 'image' | 'message' | 'attachment' | 'file';

function detectMediaType(ext: string): MediaType {
  if (['.ogg', '.m4a', '.mp3', '.wav'].includes(ext)) return 'voice_note';
  if (['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff'].includes(ext)) return 'image';
  return 'file';
}

export class EvidenceLocker {
  constructor(
    private readonly repo:       EvidenceRepository,
    private readonly lockerRoot: string,
  ) {}

  async lock(opts: LockOptions): Promise<LockResult> {
    const fileHash = await computeFileHash(opts.sourcePath).catch(() => null);
    if (!fileHash) {
      return { status: 'failed', evidenceId: null, lockerPath: null, message: 'hash computation failed' };
    }

    const existing = this.repo.findByHash(fileHash);
    if (existing) {
      return {
        status:     'already_locked',
        evidenceId: existing.id,
        lockerPath: existing.lockerPath,
        message:    `already locked: ${existing.originalFilename}`,
      };
    }

    const now    = new Date();
    const subDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const destDir = join(this.lockerRoot, subDir);
    await mkdir(destDir, { recursive: true });

    const name = basename(opts.sourcePath);
    let destPath = join(destDir, name);
    // Collision suffix
    let suffix = 0;
    while (true) {
      try {
        await import('node:fs/promises').then((m) => m.access(destPath));
        suffix++;
        const ext  = extname(name);
        const base = name.slice(0, name.length - ext.length);
        destPath = join(destDir, `${base}_${suffix}${ext}`);
      } catch {
        break;
      }
    }

    try {
      await copyFile(opts.sourcePath, destPath);
    } catch (e) {
      return { status: 'failed', evidenceId: null, lockerPath: null, message: `copy failed: ${String(e)}` };
    }

    // Write-protect
    try {
      await chmod(destPath, 0o444);
    } catch { /* non-fatal */ }

    // Windows attrib +R
    if (process.platform === 'win32') {
      execFileAsync('attrib', ['+R', destPath]).catch(() => {});
    }

    const ext  = extname(opts.sourcePath).toLowerCase();
    const mime = mimeFromExtension(ext) ?? 'application/octet-stream';

    const detectedMediaType: MediaType = opts.mediaType ?? detectMediaType(ext);
    const item = this.repo.create({
      originalPath:     opts.sourcePath,
      lockerPath:       destPath,
      fileHash,
      originalFilename: name,
      mimeType:         mime,
      sourceApp:        opts.sourceApp ?? 'whatsapp',
      mediaType:        detectedMediaType,
      caseId:           opts.caseId    ?? null,
      clientId:         opts.clientId  ?? null,
      documentId:       opts.documentId ?? null,
      isWriteProtected: true,
      notes:            opts.notes     ?? null,
    });

    return {
      status:     'locked',
      evidenceId: item.id,
      lockerPath: destPath,
      message:    `locked: ${name}`,
    };
  }

  async setAnalysis(evidenceId: number, ocrText: string): Promise<void> {
    this.repo.setAnalysis(evidenceId, ocrText);
  }

  list(filters: { caseId?: number; clientId?: number; mediaType?: string } = {}): EvidenceItem[] {
    return this.repo.list(filters);
  }

  findById(id: number): EvidenceItem | null {
    return this.repo.findById(id);
  }

  search(query: string): EvidenceItem[] {
    return this.repo.search(query);
  }
}
