import type { Repos } from '../../db.js';
import { TelegramClient, type FetchLike } from './telegram-client.js';
import { getTelegramToken } from './telegram-inbound.js';

/**
 * Transmit a text message over Telegram to a chat. Best-effort: returns the delivery
 * outcome rather than throwing, so callers can record the outbound message regardless
 * of transient network/transport failures. Requires api.telegram.org to be reachable.
 */
export async function sendTelegramText(
  repos: Repos,
  chatId: string | number,
  text: string,
  fetchFn?: FetchLike,
): Promise<{ delivered: boolean; messageId?: number; error?: string }> {
  const token = await getTelegramToken(repos);
  if (!token) return { delivered: false, error: 'telegram_not_connected' };
  try {
    const client = new TelegramClient(token, fetchFn);
    const messageId = await client.sendMessage(chatId, text);
    return { delivered: true, messageId };
  } catch (e) {
    return { delivered: false, error: e instanceof Error ? e.message : String(e) };
  }
}
