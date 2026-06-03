import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Repos } from '../../db.js';

/**
 * Local audio transcription (C5). Whisper is a speech-to-text *utility* that runs entirely
 * on-machine — audio never leaves the device. This is NOT the legal-reasoning model
 * (law-il-E2B remains the only AI model for legal content); transcription is a separate modality.
 *
 * The transcriber is injectable so the flow is unit-testable without a model. The default
 * shells out to a local Whisper binary configured via the WHISPER_CMD env var, e.g.:
 *   WHISPER_CMD="whisper-cli -l he -otxt -f"   (the audio path is appended as the last arg)
 */
export type Transcriber = (audioRef: string) => Promise<string>;

export class TranscriptionUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'TranscriptionUnavailableError'; }
}

/** Default transcriber: invoke the locally-configured Whisper command and capture stdout. */
export const localWhisperTranscriber: Transcriber = (audioRef: string) => {
  const cmd = process.env['WHISPER_CMD'];
  if (!cmd) {
    return Promise.reject(new TranscriptionUnavailableError(
      'WHISPER_CMD is not configured — set it to a local Whisper command (audio stays on-machine).',
    ));
  }
  const parts = cmd.split(/\s+/);
  const bin = parts[0]!;
  const args = [...parts.slice(1), audioRef];
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(bin, args);
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += String(d); });
    proc.stderr.on('data', (d) => { err += String(d); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new TranscriptionUnavailableError(`Whisper exited ${code}: ${err.trim().slice(0, 200)}`));
    });
  });
};

/**
 * Transcribe a voice/audio comm message locally and persist the transcript on the message.
 * Returns the transcript text. Throws if the message has no audio or no local source.
 */
export async function transcribeCommMessage(
  repos: Repos,
  messageId: number,
  transcriber: Transcriber = localWhisperTranscriber,
): Promise<string> {
  const msg = repos.communications.getMessage(messageId);
  if (!msg) throw new Error(`Message ${messageId} not found`);
  if (msg.mediaKind !== 'audio') throw new TranscriptionUnavailableError('message has no audio to transcribe');
  if (!msg.mediaRef) throw new TranscriptionUnavailableError('audio source not available locally');

  const transcript = await transcriber(msg.mediaRef);
  repos.communications.setTranscript(messageId, transcript);
  return transcript;
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};

/**
 * Transcribe a dictation audio blob (base64) locally: write to a temp file, run the transcriber,
 * then delete the temp file. Used by the call-documentation "dictate" button. Audio stays local.
 */
export async function transcribeAudioData(
  base64: string,
  mimeType: string,
  transcriber: Transcriber = localWhisperTranscriber,
): Promise<string> {
  if (!base64) throw new TranscriptionUnavailableError('no audio data');
  const ext = EXT_BY_MIME[mimeType] ?? 'webm';
  const dir = await mkdtemp(join(tmpdir(), 'factum-dictate-'));
  const path = join(dir, `audio.${ext}`);
  await writeFile(path, Buffer.from(base64, 'base64'));
  try {
    return await transcriber(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}
