import { Router } from 'express';
import type { Repos } from '../db.js';
import type { CommChannel, ConversationStatus } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError, ConflictError } from '../errors/api-error.js';
import { requireRole } from '../middleware/auth.js';
import { storeEncryptedField } from '../modules/security/index.js';
import { TelegramClient } from '../modules/telegram/telegram-client.js';
import { handleTelegramUpdate, getTelegramToken, type TelegramUpdate } from '../modules/telegram/telegram-inbound.js';
import { sendTelegramText } from '../modules/telegram/telegram-outbound.js';

const CHANNELS: CommChannel[] = ['telegram', 'whatsapp', 'email', 'phone'];
const STATUSES: ConversationStatus[] = ['open', 'closed', 'triage'];

function userIdOf(req: unknown): number | null {
  return (req as { userId?: number }).userId ?? null;
}

/**
 * Communications module API (C0). RBAC tiers:
 *  - channel credentials      → admin
 *  - read conversations/inbox → assistant+ (privileged client comms)
 *  - send / consent / ingest  → attorney+
 */
export function communicationsRouter(repos: Repos): Router {
  const router = Router();
  const { communications: comm, db } = repos;

  // ── Channels (admin only) ────────────────────────────────────────────────
  router.get('/channels', requireRole('admin', repos), asyncHandler((_req, res) => {
    ok(res, comm.listChannels());  // secrets never leave the store
  }));

  // Register/update a channel and encrypt its secret at rest (AES-256-GCM via field-cipher).
  router.post('/channels', requireRole('admin', repos), asyncHandler(async (req, res) => {
    const { channel, label, identifier, credential, status } = req.body as {
      channel?: string; label?: string; identifier?: string; credential?: string; status?: string;
    };
    if (!channel || !CHANNELS.includes(channel as CommChannel)) {
      throw new ValidationError('channel must be one of: ' + CHANNELS.join(', '));
    }
    const ch = channel as CommChannel;
    const id = comm.upsertChannel({
      channel: ch,
      ...(label !== undefined ? { label } : {}),
      ...(identifier !== undefined ? { identifier } : {}),
      ...(status !== undefined ? { status: status as 'connected' | 'disconnected' | 'error' } : {}),
    });
    if (credential) {
      // Stored in encrypted_fields; CommChannels only holds a pointer, never the secret.
      await storeEncryptedField(db, 'CommChannels', id, 'credential', credential);
      comm.upsertChannel({ channel: ch, credentialRef: `enc:CommChannels:${id}:credential` });
    }
    comm.audit({ conversationId: null, messageId: null, userId: userIdOf(req), channel: ch, action: 'channel_config', detail: credential ? 'credential_set' : 'meta' });
    ok(res, { id });
  }));

  // ── Conversations (operational — ungated like /cases, /documents) ──────────
  // Privileged-content reads; the trusted local app reaches these without a token,
  // consistent with the rest of the operational API. Secrets stay admin-gated below.
  router.get('/conversations', asyncHandler((req, res) => {
    const q = req.query;
    const filter: { caseId?: number; clientId?: number; userId?: number; status?: ConversationStatus } = {};
    if (q['caseId']   !== undefined) filter.caseId   = Number(q['caseId']);
    if (q['clientId'] !== undefined) filter.clientId = Number(q['clientId']);
    if (q['userId']   !== undefined) filter.userId   = Number(q['userId']);
    if (q['status']   !== undefined) {
      const s = String(q['status']);
      if (!STATUSES.includes(s as ConversationStatus)) throw new ValidationError('invalid status');
      filter.status = s as ConversationStatus;
    }
    ok(res, comm.listConversations(filter));
  }));

  router.get('/conversations/:id', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const conversation = comm.getConversation(id);
    if (!conversation) throw new NotFoundError('conversation not found');
    ok(res, { conversation, messages: comm.listMessages(id) });
  }));

  // Send an outbound message — human-initiated (HITL), consent-gated, audited.
  // Blocked sends return 409. For Telegram the recorded message is also transmitted
  // (best-effort); recording is never blocked by a transport failure.
  router.post('/conversations/:id/send', asyncHandler(async (req, res) => {
    const id = Number(req.params['id']);
    const { body, mediaKind, mediaRef } = req.body as { body?: string; mediaKind?: string; mediaRef?: string };
    if (!body && !mediaRef) throw new ValidationError('body or mediaRef required');
    const result = comm.sendOutbound({
      conversationId: id, userId: userIdOf(req),
      ...(body !== undefined ? { body } : {}),
      ...(mediaKind !== undefined ? { mediaKind } : {}),
      ...(mediaRef !== undefined ? { mediaRef } : {}),
    });
    if (!result.sent) {
      throw new ConflictError(`שליחה נחסמה — הלקוח לא נתן הסכמה לערוץ ${result.channel}`);
    }
    const conv = comm.getConversation(id);
    let delivery: { delivered: boolean; error?: string } | undefined;
    if (conv?.channel === 'telegram' && conv.externalThreadId && body) {
      delivery = await sendTelegramText(repos, conv.externalThreadId, body);
      comm.audit({
        conversationId: id, messageId: result.messageId, userId: userIdOf(req),
        channel: 'telegram', action: delivery.delivered ? 'delivered' : 'delivery_failed',
        detail: delivery.error ?? null,
      });
    }
    ok(res, { ...result, ...(delivery ? { delivery } : {}) });
  }));

  // ── Inbound ingestion (operational) ───────────────────────────────────────
  // Manual/test ingestion point; channel webhooks (C1+) call the repo directly.
  router.post('/inbound', asyncHandler((req, res) => {
    const b = req.body as { channel?: string; externalId?: string; body?: string; displayName?: string;
      mediaKind?: string; mediaRef?: string; externalThreadId?: string };
    if (!b.channel || !CHANNELS.includes(b.channel as CommChannel)) throw new ValidationError('invalid channel');
    if (!b.externalId) throw new ValidationError('externalId required');
    const result = comm.routeInbound({
      channel: b.channel as CommChannel, externalId: b.externalId,
      ...(b.body !== undefined ? { body: b.body } : {}),
      ...(b.displayName !== undefined ? { displayName: b.displayName } : {}),
      ...(b.mediaKind !== undefined ? { mediaKind: b.mediaKind } : {}),
      ...(b.mediaRef !== undefined ? { mediaRef: b.mediaRef } : {}),
      ...(b.externalThreadId !== undefined ? { externalThreadId: b.externalThreadId } : {}),
    });
    ok(res, result);
  }));

  router.post('/messages/:id/handled', asyncHandler((req, res) => {
    comm.markHandled(Number(req.params['id']));
    ok(res, { handled: true });
  }));

  // ── Consent (operational; recorded + audited) ─────────────────────────────
  router.post('/consent', asyncHandler((req, res) => {
    const { clientId, channel, granted, source } = req.body as {
      clientId?: number; channel?: string; granted?: boolean; source?: string;
    };
    if (!clientId) throw new ValidationError('clientId required');
    if (!channel || !CHANNELS.includes(channel as CommChannel)) throw new ValidationError('invalid channel');
    comm.recordConsent(Number(clientId), channel as CommChannel, granted !== false, source);
    ok(res, { clientId, channel, granted: granted !== false });
  }));

  router.get('/consent/:clientId/:channel', asyncHandler((req, res) => {
    const channel = req.params['channel'] as CommChannel;
    if (!CHANNELS.includes(channel)) throw new ValidationError('invalid channel');
    ok(res, { granted: comm.hasConsent(Number(req.params['clientId']), channel) });
  }));

  // ── Unknown inbox (operational) ───────────────────────────────────────────
  router.get('/unknown', asyncHandler((req, res) => {
    ok(res, comm.listUnknownInbox(req.query['all'] === 'true'));
  }));

  // ── Telegram (C1) ─────────────────────────────────────────────────────────
  // Connect the firm bot: store the token encrypted, verify via getMe, mark connected.
  // Requires api.telegram.org to be reachable (runtime network allowlist).
  router.post('/telegram/connect', requireRole('admin', repos), asyncHandler(async (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) throw new ValidationError('token required');
    let me;
    try {
      me = await new TelegramClient(token).getMe();
    } catch (e) {
      throw new ConflictError(`אימות הבוט נכשל: ${e instanceof Error ? e.message : String(e)}`);
    }
    const id = comm.upsertChannel({
      channel: 'telegram', status: 'connected',
      ...(me.username ? { identifier: `@${me.username}`, label: me.first_name } : {}),
    });
    await storeEncryptedField(db, 'CommChannels', id, 'credential', token);
    comm.upsertChannel({ channel: 'telegram', credentialRef: `enc:CommChannels:${id}:credential` });
    comm.audit({ conversationId: null, messageId: null, userId: userIdOf(req), channel: 'telegram', action: 'channel_config', detail: 'telegram_connected' });
    ok(res, { connected: true, bot: me.username ?? null });
  }));

  // Inbound webhook. Public (no Bearer), but verified via Telegram's secret-token header.
  // Set COMM_TELEGRAM_WEBHOOK_SECRET to enable verification.
  router.post('/telegram/webhook', asyncHandler(async (req, res) => {
    const secret = process.env['COMM_TELEGRAM_WEBHOOK_SECRET'];
    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      throw new ConflictError('invalid webhook secret');
    }
    const result = handleTelegramUpdate(repos, req.body as TelegramUpdate);
    // Always 200 so Telegram does not retry indefinitely on non-routable updates.
    ok(res, { handled: result !== null, ...(result ? { routing: result } : {}) });
  }));

  // Register the webhook URL with Telegram (admin).
  router.post('/telegram/set-webhook', requireRole('admin', repos), asyncHandler(async (req, res) => {
    const { url } = req.body as { url?: string };
    if (!url) throw new ValidationError('url required');
    const token = await getTelegramToken(repos);
    if (!token) throw new ConflictError('telegram_not_connected');
    const secret = process.env['COMM_TELEGRAM_WEBHOOK_SECRET'];
    await new TelegramClient(token).setWebhook(url, secret);
    ok(res, { ok: true });
  }));

  return router;
}
