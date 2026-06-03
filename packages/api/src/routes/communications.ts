import { Router } from 'express';
import type { Repos } from '../db.js';
import type { CommChannel, ConversationStatus } from '@factum-il/database';
import { asyncHandler } from '../utils/async-handler.js';
import { ok } from '../utils/response.js';
import { ValidationError, NotFoundError, ConflictError } from '../errors/api-error.js';
import { requireRole } from '../middleware/auth.js';
import { storeEncryptedField } from '../modules/security/index.js';
import { CommTemplatesRepository } from '@factum-il/database';
import { transcribeCommMessage, transcribeAudioData, TranscriptionUnavailableError } from '../modules/transcription/whisper.js';
import { TelegramClient } from '../modules/telegram/telegram-client.js';
import { handleTelegramUpdate, getTelegramToken, type TelegramUpdate } from '../modules/telegram/telegram-inbound.js';
import { sendTelegramText } from '../modules/telegram/telegram-outbound.js';

const CHANNELS: CommChannel[] = ['telegram', 'whatsapp', 'email', 'phone'];
const STATUSES: ConversationStatus[] = ['open', 'closed', 'triage'];

function userIdOf(req: unknown): number | null {
  return (req as { userId?: number }).userId ?? null;
}

const LINK_BASE  = process.env['COMM_LINK_BASE_URL'] ?? 'http://localhost';
const FIRM_NAME  = process.env['COMM_FIRM_NAME'] ?? 'המשרד';

function heDate(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return iso; }
}

interface CaseVarRow { case_number: string; title_he: string; court_name: string | null; client_id: number | null; status: string; case_type: string }

/** Resolve the variable map for a case. Secure-link placeholders are only minted when `mint` is true. */
function resolveCaseVars(
  repos: Repos, caseId: number, body: string, userId: number | null, mint: boolean,
): Record<string, string> {
  const c = repos.db.prepare(
    'SELECT case_number, title_he, court_name, client_id, status, case_type FROM Cases WHERE id = ?',
  ).get(caseId) as CaseVarRow | undefined;
  const clientName = c?.client_id != null
    ? (repos.db.prepare('SELECT name_he FROM Clients WHERE id = ?').get(c.client_id) as { name_he: string } | undefined)?.name_he
    : undefined;
  const hearing = repos.db.prepare(
    "SELECT hearing_date FROM court_hearings WHERE case_id = ? AND hearing_date >= date('now') ORDER BY hearing_date ASC LIMIT 1",
  ).get(caseId) as { hearing_date: string } | undefined;

  const vars: Record<string, string> = {
    client_name:  clientName ?? '',
    case_number:  c?.case_number ?? '',
    case_title:   c?.title_he ?? '',
    court_name:   c?.court_name ?? '',
    next_hearing: heDate(hearing?.hearing_date ?? null),
    today:        new Date().toLocaleDateString('he-IL'),
    firm_name:    FIRM_NAME,
  };

  // Secure local links — minted only when actually composing (not on preview).
  const wantsSign   = body.includes('{{sign_link}}');
  const wantsUpload = body.includes('{{upload_link}}');
  if (mint) {
    if (wantsSign) {
      const { token } = repos.commTemplates.createSecureLink({ purpose: 'sign', caseId, createdBy: userId, ttlHours: 168 });
      vars['sign_link'] = `${LINK_BASE}/secure/${token}`;
    }
    if (wantsUpload) {
      const { token } = repos.commTemplates.createSecureLink({ purpose: 'upload', caseId, createdBy: userId, ttlHours: 168 });
      vars['upload_link'] = `${LINK_BASE}/secure/${token}`;
    }
  } else {
    if (wantsSign)   vars['sign_link']   = '[קישור מאובטח לחתימה]';
    if (wantsUpload) vars['upload_link'] = '[קישור מאובטח להעלאה]';
  }
  return vars;
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

  // ── Evidence + transcription (C5) ─────────────────────────────────────────
  // Snapshot a message as a write-protected, content-hashed exhibit bound to its case.
  router.post('/messages/:id/save-evidence', asyncHandler((req, res) => {
    const exhibit = comm.saveMessageAsEvidence(Number(req.params['id']), userIdOf(req));
    ok(res, exhibit);
  }));

  // Locked exhibits for a case.
  router.get('/evidence', asyncHandler((req, res) => {
    const caseId = req.query['caseId'];
    if (caseId === undefined) throw new ValidationError('caseId required');
    ok(res, comm.listCaseEvidence(Number(caseId)));
  }));

  // Transcribe a voice/audio message locally (Whisper). 503 when no local transcriber.
  router.post('/messages/:id/transcribe', asyncHandler(async (req, res) => {
    try {
      const transcript = await transcribeCommMessage(repos, Number(req.params['id']));
      ok(res, { transcript });
    } catch (e) {
      if (e instanceof TranscriptionUnavailableError) {
        throw new ConflictError(`תמלול אינו זמין: ${e.message}`);
      }
      throw e;
    }
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

  // ── Smart templates (C4) ──────────────────────────────────────────────────
  // All active templates (admin/management view).
  router.get('/templates', asyncHandler((_req, res) => {
    ok(res, repos.commTemplates.listTemplates());
  }));

  // Context-matched templates with a non-minting preview for a case (or generic if no case).
  router.get('/templates/match', asyncHandler((req, res) => {
    const caseIdRaw = req.query['caseId'];
    const channel   = req.query['channel'] as CommChannel | undefined;
    if (channel && !CHANNELS.includes(channel)) throw new ValidationError('invalid channel');

    let ctx: { channel?: CommChannel; caseType?: string | null; caseStatus?: string | null } = {};
    let vars: Record<string, string> | null = null;
    if (caseIdRaw !== undefined) {
      const caseId = Number(caseIdRaw);
      const c = repos.db.prepare('SELECT status, case_type FROM Cases WHERE id = ?').get(caseId) as
        { status: string; case_type: string } | undefined;
      if (!c) throw new NotFoundError('case not found');
      ctx = { caseType: c.case_type, caseStatus: c.status, ...(channel ? { channel } : {}) };
      vars = null; // resolved per template below (only for those needing it)
    } else if (channel) {
      ctx = { channel };
    }

    const matched = repos.commTemplates.matchTemplates(ctx);
    const result = matched.map((t) => {
      let preview = t.body;
      if (caseIdRaw !== undefined) {
        if (!vars) vars = resolveCaseVars(repos, Number(caseIdRaw), t.body, userIdOf(req), false);
        else if (t.body.includes('{{sign_link}}') || t.body.includes('{{upload_link}}')) {
          vars = resolveCaseVars(repos, Number(caseIdRaw), t.body, userIdOf(req), false);
        }
        preview = CommTemplatesRepository.render(t.body, vars);
      }
      return { id: t.id, nameHe: t.nameHe, channel: t.channel, preview };
    });
    ok(res, result);
  }));

  // Render a template for a case — mints real secure links for sign/upload placeholders.
  router.post('/templates/:id/render', asyncHandler((req, res) => {
    const id = Number(req.params['id']);
    const { caseId } = req.body as { caseId?: number };
    const tpl = repos.commTemplates.getTemplate(id);
    if (!tpl) throw new NotFoundError('template not found');
    if (caseId === undefined) {
      // No case context — render with empty vars (generic placeholders collapse to '—').
      ok(res, { rendered: CommTemplatesRepository.render(tpl.body, {}) });
      return;
    }
    const vars = resolveCaseVars(repos, Number(caseId), tpl.body, userIdOf(req), true);
    ok(res, { rendered: CommTemplatesRepository.render(tpl.body, vars) });
  }));

  // ── Call documentation (C6) ───────────────────────────────────────────────
  // Log a phone call (no live recording). Optional action items become linked Tasks.
  router.post('/calls', asyncHandler((req, res) => {
    const b = req.body as {
      clientId?: number; caseId?: number | null; direction?: string; subject?: string;
      summary?: string; occurredAt?: string; durationMinutes?: number;
      participants?: string[]; tags?: string[];
      actionItems?: Array<{ title: string; dueDate?: string; priority?: string }>;
    };
    if (!b.clientId) throw new ValidationError('clientId required');
    if (b.direction && !['inbound', 'outbound'].includes(b.direction)) throw new ValidationError('invalid direction');

    const call = repos.callLogs.create({
      clientId: b.clientId,
      caseId: b.caseId ?? null,
      ...(b.direction ? { direction: b.direction as 'inbound' | 'outbound' } : {}),
      ...(b.subject !== undefined ? { subject: b.subject } : {}),
      ...(b.summary !== undefined ? { summary: b.summary } : {}),
      ...(b.occurredAt ? { occurredAt: b.occurredAt } : {}),
      ...(b.durationMinutes !== undefined ? { durationMinutes: b.durationMinutes } : {}),
      ...(b.participants ? { participants: b.participants } : {}),
      ...(b.tags ? { tags: b.tags } : {}),
      createdBy: userIdOf(req),
    });

    // Action items → Tasks linked to the matter/client.
    const taskIds: number[] = [];
    for (const item of b.actionItems ?? []) {
      if (!item.title?.trim()) continue;
      const t = repos.tasks.create({
        title: item.title.trim(), source: 'manual',
        ...(b.caseId != null ? { caseId: b.caseId } : {}),
        clientId: b.clientId,
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        ...(item.priority ? { priority: item.priority as 'low' | 'normal' | 'high' | 'critical' } : {}),
      });
      taskIds.push(t.id);
    }
    ok(res, { call, taskIds });
  }));

  router.get('/calls', asyncHandler((req, res) => {
    const { clientId, caseId } = req.query;
    if (caseId   !== undefined) { ok(res, repos.callLogs.listByCase(Number(caseId))); return; }
    if (clientId !== undefined) { ok(res, repos.callLogs.listByClient(Number(clientId))); return; }
    throw new ValidationError('clientId or caseId required');
  }));

  router.patch('/calls/:id', asyncHandler((req, res) => {
    const updated = repos.callLogs.update(Number(req.params['id']), req.body as Record<string, never>);
    if (!updated) throw new NotFoundError('call log not found');
    ok(res, updated);
  }));

  // Promote a call into a case timeline (the "save as evidence" bridge).
  router.post('/calls/:id/save-evidence', asyncHandler((req, res) => {
    const { caseId } = req.body as { caseId?: number };
    if (!caseId) throw new ValidationError('caseId required');
    const updated = repos.callLogs.saveAsEvidence(Number(req.params['id']), Number(caseId));
    if (!updated) throw new NotFoundError('call log not found');
    comm.audit({ conversationId: null, messageId: null, userId: userIdOf(req), channel: 'phone', action: 'save_evidence', detail: `call:${updated.id}` });
    ok(res, updated);
  }));

  // Dictation: transcribe an audio blob locally (Whisper). 409 when no local transcriber.
  router.post('/transcribe-audio', asyncHandler(async (req, res) => {
    const { audioBase64, mimeType } = req.body as { audioBase64?: string; mimeType?: string };
    if (!audioBase64) throw new ValidationError('audioBase64 required');
    try {
      const transcript = await transcribeAudioData(audioBase64, mimeType ?? 'audio/webm');
      ok(res, { transcript });
    } catch (e) {
      if (e instanceof TranscriptionUnavailableError) throw new ConflictError(`תמלול אינו זמין: ${e.message}`);
      throw e;
    }
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
