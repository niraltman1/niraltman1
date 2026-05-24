import { google } from 'googleapis';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Repos } from '../../db.js';
import { getAccessToken } from './gmail-oauth.js';
import { EvidenceLocker } from '../evidence/evidence-locker.js';

const LOCKER_ROOT = process.env['LOCKER_ROOT'] ?? join(process.cwd(), '_evidence');

export interface SyncResult {
  configId:            number;
  messagesFound:       number;
  attachmentsIngested: number;
  errorsCount:         number;
  errorSummary:        string | null;
}

export async function runGmailSync(repos: Repos, configId: number): Promise<SyncResult> {
  const config = repos.gmail.findConfig(configId);
  if (!config || !config.is_enabled) {
    return { configId, messagesFound: 0, attachmentsIngested: 0, errorsCount: 0, errorSummary: 'Config not found or disabled' };
  }

  let messagesFound       = 0;
  let attachmentsIngested = 0;
  let errorsCount         = 0;
  const errorMessages: string[] = [];

  const locker = new EvidenceLocker(repos.evidence, LOCKER_ROOT);

  try {
    const accessToken = await getAccessToken({
      encrypted_token: config.encrypted_token,
      token_iv:        config.token_iv,
      token_tag:       config.token_tag,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth });

    // List messages with label filter since last sync
    const listParams: Record<string, unknown> = {
      userId: 'me',
      q:      `label:${config.label_filter} has:attachment`,
    };
    if (config.last_message_id) {
      listParams['pageToken'] = undefined; // Start from beginning; filter by date instead
    }

    const listRes = await (gmail.users.messages.list as unknown as (p: typeof listParams) => Promise<{ data: { messages?: { id?: string }[] } }>)(listParams);
    const messages = listRes.data.messages ?? [];
    messagesFound = messages.length;

    let lastMsgId: string | null = config.last_message_id;
    const tmpDir = join(tmpdir(), `factum-il-gmail-${configId}-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    for (const msg of messages) {
      if (!msg.id) continue;
      // Skip messages already processed
      if (config.last_message_id && msg.id <= config.last_message_id) continue;

      try {
        const msgRes = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const parts  = msgRes.data.payload?.parts ?? [];

        for (const part of parts) {
          if (!part.filename || !part.body?.attachmentId) continue;
          const attRes = await gmail.users.messages.attachments.get({
            userId: 'me', messageId: msg.id, id: part.body.attachmentId,
          });
          const data = attRes.data.data;
          if (!data) continue;

          // Write attachment to temp file
          const tmpPath = join(tmpDir, part.filename.replace(/[^a-zA-Z0-9._֐-׿-]/g, '_'));
          const buf     = Buffer.from(data, 'base64');
          await writeFile(tmpPath, buf);

          // Lock to Evidence Locker (chain of custody)
          const result = await locker.lock({ sourcePath: tmpPath, sourceApp: 'email' });
          if (result.status === 'locked' || result.status === 'already_locked') {
            attachmentsIngested++;
          } else {
            errorsCount++;
            errorMessages.push(`Lock failed: ${part.filename}`);
          }
          await unlink(tmpPath).catch(() => {});
        }

        if (!lastMsgId || msg.id > lastMsgId) lastMsgId = msg.id;
      } catch (e) {
        errorsCount++;
        errorMessages.push(String(e));
      }
    }

    // Update sync state
    const nowIso = new Date().toISOString();
    repos.gmail.updateSync(configId, {
      last_sync_at:    nowIso,
      ...(lastMsgId ? { last_message_id: lastMsgId } : {}),
    });

  } catch (e) {
    errorsCount++;
    errorMessages.push(`Sync failed: ${String(e)}`);
  }

  const errorSummary = errorMessages.length > 0 ? errorMessages.slice(0, 3).join('; ') : null;
  repos.gmail.logSync({ sync_config_id: configId, messages_found: messagesFound, attachments_ingested: attachmentsIngested, errors_count: errorsCount, error_summary: errorSummary });

  return { configId, messagesFound, attachmentsIngested, errorsCount, errorSummary };
}
