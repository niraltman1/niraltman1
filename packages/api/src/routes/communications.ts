import { Router } from 'express';
import type { Repos } from '../db.js';
import type { CommChannel, ConversationStatus } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError, ConflictError } from '../errors/api-error.js';
import { requireRole } from '../middleware/auth.js';
import { storeEncryptedField } from '../modules/security/index.js';

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

  // ── Conversations (assistant+) ────────────────────────────────────────────
  router.get('/conversations', requireRole('assistant', repos), asyncHandler((req, res) => {
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

  router.get('/conversations/:id', requireRole('assistant', repos), asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const conversation = comm.getConversation(id);
    if (!conversation) throw new NotFoundError('conversation not found');
    ok(res, { conversation, messages: comm.listMessages(id) });
  }));

  // Send an outbound message — consent-gated. Blocked sends return 409.
  router.post('/conversations/:id/send', requireRole('attorney', repos), asyncHandler((req, res) => {
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
    ok(res, result);
  }));

  // ── Inbound ingestion (attorney+) ─────────────────────────────────────────
  // Manual/test ingestion point; channel webhooks (C1+) call the repo directly.
  router.post('/inbound', requireRole('attorney', repos), asyncHandler((req, res) => {
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

  router.post('/messages/:id/handled', requireRole('assistant', repos), asyncHandler((req, res) => {
    comm.markHandled(Number(req.params['id']));
    ok(res, { handled: true });
  }));

  // ── Consent (attorney+) ───────────────────────────────────────────────────
  router.post('/consent', requireRole('attorney', repos), asyncHandler((req, res) => {
    const { clientId, channel, granted, source } = req.body as {
      clientId?: number; channel?: string; granted?: boolean; source?: string;
    };
    if (!clientId) throw new ValidationError('clientId required');
    if (!channel || !CHANNELS.includes(channel as CommChannel)) throw new ValidationError('invalid channel');
    comm.recordConsent(Number(clientId), channel as CommChannel, granted !== false, source);
    ok(res, { clientId, channel, granted: granted !== false });
  }));

  router.get('/consent/:clientId/:channel', requireRole('assistant', repos), asyncHandler((req, res) => {
    const channel = req.params['channel'] as CommChannel;
    if (!CHANNELS.includes(channel)) throw new ValidationError('invalid channel');
    ok(res, { granted: comm.hasConsent(Number(req.params['clientId']), channel) });
  }));

  // ── Unknown inbox (assistant+) ────────────────────────────────────────────
  router.get('/unknown', requireRole('assistant', repos), asyncHandler((req, res) => {
    ok(res, comm.listUnknownInbox(req.query['all'] === 'true'));
  }));

  return router;
}
