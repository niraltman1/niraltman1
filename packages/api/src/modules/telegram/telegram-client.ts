// Thin wrapper over the official Telegram Bot API.
// HTTP is injectable (FetchLike) so the logic is unit-testable without network.
// NOTE: live use requires the runtime network allowlist to include api.telegram.org.

export interface TelegramUser {
  id:         number;
  is_bot?:    boolean;
  first_name: string;
  last_name?: string;
  username?:  string;
}

export interface FetchLikeResponse {
  ok:           boolean;
  status:       number;
  json():       Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string, init?: {
  method?: string; headers?: Record<string, string>; body?: string;
}) => Promise<FetchLikeResponse>;

interface TgEnvelope<T> { ok: boolean; result?: T; error_code?: number; description?: string }

export class TelegramApiError extends Error {
  constructor(public readonly code: number, message: string) {
    super(`Telegram API error ${code}: ${message}`);
    this.name = 'TelegramApiError';
  }
}

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchLike = fetch as unknown as FetchLike,
  ) {}

  private apiBase(): string { return `https://api.telegram.org/bot${this.token}`; }
  private fileBase(): string { return `https://api.telegram.org/file/bot${this.token}`; }

  /** Invoke a Bot API method, unwrapping the {ok,result} envelope or throwing on error. */
  async call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchFn(`${this.apiBase()}/${method}`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(params ?? {}),
    });
    const env = (await res.json()) as TgEnvelope<T>;
    if (!env.ok || env.result === undefined) {
      throw new TelegramApiError(env.error_code ?? res.status, env.description ?? 'unknown error');
    }
    return env.result;
  }

  /** Health check / identity — used when connecting a bot token. */
  getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>('getMe');
  }

  /** Send a text message; returns the Telegram message_id. */
  async sendMessage(chatId: string | number, text: string): Promise<number> {
    const msg = await this.call<{ message_id: number }>('sendMessage', { chat_id: chatId, text });
    return msg.message_id;
  }

  /** Resolve a file_id to a downloadable file_path. */
  async getFilePath(fileId: string): Promise<string> {
    const f = await this.call<{ file_path: string }>('getFile', { file_id: fileId });
    return f.file_path;
  }

  /** Download a file by its file_path into a Buffer (content stays local). */
  async downloadFile(filePath: string): Promise<Buffer> {
    const res = await this.fetchFn(`${this.fileBase()}/${filePath}`);
    if (!res.ok) throw new TelegramApiError(res.status, 'file download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  /** Register a webhook URL with an optional secret token (verified on inbound). */
  setWebhook(url: string, secretToken?: string): Promise<true> {
    return this.call<true>('setWebhook', {
      url,
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  }
}
