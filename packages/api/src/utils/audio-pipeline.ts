/**
 * Audio Pipeline — transcribes WhatsApp voice notes and other audio files.
 *
 * Supported formats: .ogg (WhatsApp), .m4a, .mp3, .wav
 *
 * Toolchain:
 *   1. ffmpeg converts .ogg/.m4a → 16kHz mono WAV (required by whisper)
 *   2. whisper-fast.exe (or whisper.cpp) transcribes the WAV to Hebrew text
 *   3. Transcript is stored as ocr_text in the Documents table
 *
 * Tool locations (configurable via env):
 *   WHISPER_EXE  — path to whisper-fast.exe (default: <FACTUM_IL_ROOT>\tools\whisper-fast.exe)
 *   FFMPEG_EXE   — path to ffmpeg.exe (default: "ffmpeg" from PATH)
 *   WHISPER_MODEL — whisper model name (default: "medium")
 *
 * On Linux/dev: if WHISPER_EXE is not found, transcription is skipped gracefully
 * and the file is registered as a document with empty ocr_text.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, basename, extname } from 'node:path';
import { unlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ProcessedFilesRepository, DocumentRepository } from '@factum-il/database';
import { computeFileHash, getFileSize, mimeFromExtension } from './file-hash.js';

const execFileAsync = promisify(execFile);

const FACTUM_IL_ROOT = process.env['FACTUM_IL_ROOT'] ?? process.cwd();
const WHISPER_EXE   = process.env['WHISPER_EXE']   ?? join(FACTUM_IL_ROOT, 'tools', 'whisper-fast.exe');
const FFMPEG_EXE    = process.env['FFMPEG_EXE']     ?? 'ffmpeg';
const WHISPER_MODEL = process.env['WHISPER_MODEL']  ?? 'medium';

export const AUDIO_EXTENSIONS = new Set(['.ogg', '.m4a', '.mp3', '.wav']);

async function isExecutable(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync(FFMPEG_EXE, [
    '-y', '-i', inputPath,
    '-ar', '16000',   // 16kHz required by whisper
    '-ac', '1',       // mono
    '-c:a', 'pcm_s16le',
    outputPath,
  ], { timeout: 60_000 });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts: number, delayMs: number): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      await new Promise<void>((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

async function transcribeWav(wavPath: string): Promise<string> {
  const outBase = join(tmpdir(), `whisper_${Date.now()}`);
  try {
    await execFileAsync(WHISPER_EXE, [
      '-m', WHISPER_MODEL,
      '-l', 'he',       // Hebrew
      '-f', wavPath,
      '-otxt',
      '-of', outBase,
    ], { timeout: 300_000 }); // 5 min max

    const { readFile } = await import('node:fs/promises');
    const text = await readFile(`${outBase}.txt`, 'utf-8');
    return text.trim();
  } finally {
    try { await unlink(`${outBase}.txt`); } catch { /* ignore */ }
  }
}

export interface AudioIngestResult {
  status:     'registered' | 'already_registered' | 'failed' | 'excluded' | 'no_whisper';
  fileHash:   string;
  documentId: number | null;
  message:    string;
  transcript: string | null;
}

export async function processAudio(
  filePath: string,
  deps: { processedFiles: ProcessedFilesRepository; documents: DocumentRepository },
): Promise<AudioIngestResult> {
  const { processedFiles, documents } = deps;

  const fileHash = await computeFileHash(filePath).catch(() => null);
  if (!fileHash) {
    return { status: 'failed', fileHash: '', documentId: null, message: 'גיבוב קובץ נכשל', transcript: null };
  }

  const existing = processedFiles.findByHash(fileHash);
  if (existing) {
    return {
      status: 'already_registered',
      fileHash,
      documentId: existing.documentId,
      message: `כבר רשום: ${basename(filePath)}`,
      transcript: null,
    };
  }

  const whisperAvailable = await isExecutable(WHISPER_EXE);
  let transcript: string | null = null;

  if (whisperAvailable) {
    const ext = extname(filePath).toLowerCase();
    let wavPath = filePath;
    let tempWav: string | null = null;

    if (ext !== '.wav') {
      tempWav = join(tmpdir(), `audio_${Date.now()}.wav`);
      try {
        await convertToWav(filePath, tempWav);
        wavPath = tempWav;
      } catch (e) {
        console.warn(`[Audio] ffmpeg conversion failed for ${basename(filePath)}:`, e);
      }
    }

    if (wavPath) {
      try {
        transcript = await withRetry(() => transcribeWav(wavPath), 2, 2_000);
        console.log(`[Audio] Transcribed ${basename(filePath)}: ${transcript.length} chars`);
      } catch (e) {
        console.warn(`[Audio] Whisper transcription failed after retry:`, e);
      }
    }

    if (tempWav) try { await unlink(tempWav); } catch { /* ignore */ }
  } else {
    console.warn(`[Audio] whisper-fast.exe not found at ${WHISPER_EXE} — registering without transcript`);
  }

  const size = (await getFileSize(filePath).catch(() => null)) ?? 0;
  const ext  = extname(filePath).toLowerCase();
  const mime = mimeFromExtension(ext) ?? 'audio/ogg';
  const name = basename(filePath);

  try {
    const doc = documents.create({
      fileHash,
      originalPath:  filePath,
      storagePath:   filePath,
      filename:      name,
      extension:     ext,
      fileSizeBytes: size,
      mimeType:      mime,
      language:      'he',
    });

    if (transcript) {
      documents.setOcrText(doc.id, transcript);
    }

    processedFiles.register({
      fileHash,
      originalPath: filePath,
      currentPath:  filePath,
      originalName: name,
      fileSizeBytes: size,
      mimeType:     mime,
    });

    processedFiles.updateStatus(fileHash, transcript ? 'complete' : 'pending', {
      documentId: doc.id,
    });

    return {
      status:     whisperAvailable ? 'registered' : 'no_whisper',
      fileHash,
      documentId: doc.id,
      message:    transcript
        ? `תומלל ונרשם: ${name} (${transcript.length} תווים)`
        : `נרשם ללא תמלול: ${name}`,
      transcript,
    };
  } catch (e) {
    return {
      status: 'failed',
      fileHash,
      documentId: null,
      message: `שגיאה ברישום: ${String(e)}`,
      transcript: null,
    };
  }
}
