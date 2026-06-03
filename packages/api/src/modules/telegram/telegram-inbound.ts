import type { Repos } from '../../db.js';
import type { RoutingResult } from '@factum-il/database';
import { retrieveEncryptedField } from '../security/index.js';

// Minimal subset of the Telegram Update shape we consume.
interface TgChat { id: number }
interface TgFrom { id: number; first_name?: string; last_name?: string; username?: string }
interface TgPhotoSize { file_id: string; file_size?: number }
interface TgDocument { file_id: string }
interface TgVoice { file_id: string }
export interface TelegramMessage {
  message_id: number;
  chat:       TgChat;
  from?:      TgFrom;
  text?:      string;
  caption?:   string;
  photo?:     TgPhotoSize[];
  document?:  TgDocument;
  voice?:     TgVoice;
  audio?:     TgDocument;
  video?:     TgDocument;
}
export interface TelegramUpdate {
  update_id: number;
  message?:  TelegramMessage;
}

function displayName(from?: TgFrom): string | undefined {
  if (!from) return undefined;
  const full = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
  return full || from.username || undefined;
}

/** Extract media kind + the channel file_id (used later for local download), if any. */
function extractMedia(m: TelegramMessage): { mediaKind?: string; mediaRef?: string } {
  if (m.photo && m.photo.length > 0) {
    // Telegram sends ascending sizes — the last is the largest.
    return { mediaKind: 'image', mediaRef: m.photo[m.photo.length - 1]!.file_id };
  }
  if (m.document) return { mediaKind: 'document', mediaRef: m.document.file_id };
  if (m.voice)    return { mediaKind: 'audio',    mediaRef: m.voice.file_id };
  if (m.audio)    return { mediaKind: 'audio',    mediaRef: m.audio.file_id };
  if (m.video)    return { mediaKind: 'video',    mediaRef: m.video.file_id };
  return {};
}

/**
 * Map an inbound Telegram update to the Smart Routing engine. Pure w.r.t. the network:
 * media is recorded by its Telegram file_id (downloaded to a local path later by a worker).
 * Returns null for updates without a routable message.
 */
export function handleTelegramUpdate(repos: Repos, update: TelegramUpdate): RoutingResult | null {
  const m = update.message;
  if (!m || !m.from) return null;

  const body = m.text ?? m.caption;
  const { mediaKind, mediaRef } = extractMedia(m);

  return repos.communications.routeInbound({
    channel:           'telegram',
    externalId:        String(m.from.id),
    externalThreadId:  String(m.chat.id),
    externalMessageId: String(m.message_id),
    ...(displayName(m.from) !== undefined ? { displayName: displayName(m.from)! } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(mediaKind !== undefined ? { mediaKind } : {}),
    ...(mediaRef !== undefined ? { mediaRef } : {}),
  });
}

/** Retrieve the decrypted Telegram bot token from the encrypted store, or null if unset. */
export async function getTelegramToken(repos: Repos): Promise<string | null> {
  const row = repos.db.prepare("SELECT id FROM CommChannels WHERE channel = 'telegram'")
    .get() as { id: number } | undefined;
  if (!row) return null;
  return retrieveEncryptedField(repos.db, 'CommChannels', row.id, 'credential');
}
